import { Mesh, MeshRenderer, Node } from 'cc';
import { ShardBlob } from './ShardStore';

/**
 * 碎片切割算法（与解体模式、模型实例无关的纯数据操作）：
 * 把模型的 MeshRenderer 网格按三角形分组切成多个小碎片的原始数据（ShardBlob）。
 * 切网格结果只取决于「源网格数据 + 档位」，因此可缓存复用（见 ShardStore），
 * 供 Debug 场景内预缓存与 Intro 开机预热（Boot/ShardPreheater）共同调用。
 */

/** 单碎片三角形数上限：3×21845 = 65535，恰为 utils.createMesh（R16UI 索引）的顶点数上限 */
export const FX_MAX_TRIS_PER_SHARD = 21845;

/** readAttribute 的属性名参数类型（gfx.AttributeName 不在 cc 顶层导出，用内置工具类型取） */
type AttrName = Parameters<Mesh['readAttribute']>[1];
/** 顶点属性名：引擎按字符串名查找，常量处一次性断言（gfx.AttributeName 未导出） */
const ATTR_POSITION = 'a_position' as unknown as AttrName;
const ATTR_NORMAL = 'a_normal' as unknown as AttrName;
const ATTR_TEXCOORD = 'a_texCoord' as unknown as AttrName;

/**
 * 单个渲染器子网格的原始属性数据：预热时对每个渲染器只读一次，
 * 供全部档位（10/60/120）复用，避免每档重复 readAttribute 全量拷贝。
 */
export interface SrcSubMesh {
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    /** readIndices 视索引宽度可能返回 8/16/32 位 */
    indices: Uint8Array | Uint16Array | Uint32Array;
}

/**
 * 计算节点在模型根内的路径（'/' 分隔；模型根本身为 ''）。
 * 碎片模板跨场景复用时只存路径不存节点引用——模型每次进入都是新实例。
 */
export function nodePathWithin(node: Node, root: Node): string {
    const names: string[] = [];
    let cur: Node | null = node;
    while (cur && cur !== root) {
        names.unshift(cur.name);
        cur = cur.parent;
    }
    return names.join('/');
}

/** 按模型内路径逐段精确查找节点（不用 getChildByPath：依赖字符串切分，异常名称易歧义） */
export function resolveNodePath(root: Node, path: string): Node | null {
    if (!path) return root;
    let cur: Node | null = root;
    for (const name of path.split('/')) {
        if (!name) return null;
        cur = cur.getChildByName(name);
        if (!cur) return null;
    }
    return cur;
}

/** 读取单个渲染器全部子网格的原始属性（readAttribute 是全量 CPU 拷贝，每个渲染器只做一次） */
export function readSubMeshes(renderer: MeshRenderer): (SrcSubMesh | null)[] {
    const mesh = renderer.mesh;
    const out: (SrcSubMesh | null)[] = [];
    if (!mesh) return out;
    for (let s = 0; s < mesh.renderingSubMeshes.length; s++) {
        const positions = mesh.readAttribute(s, ATTR_POSITION) as Float32Array | null;
        const indices = mesh.readIndices(s);
        if (!positions || !indices) {
            out.push(null);
            continue;
        }
        out.push({
            positions,
            normals: mesh.readAttribute(s, ATTR_NORMAL) as Float32Array | null,
            uvs: mesh.readAttribute(s, ATTR_TEXCOORD) as Float32Array | null,
            indices,
        });
    }
    return out;
}

/**
 * 轻量几何指纹：渲染器数量 + 全部网格包围盒（minPosition/maxPosition 取 struct
 * 缓存值，无数据拷贝）。用于磁盘缓存失效校验——模型重新导入后 prefab uuid 不变
 * 但几何可能已变，指纹不一致即丢弃磁盘缓存重新切，防止播放陈旧碎片。
 */
export function modelFingerprint(model: Node): number[] {
    const renderers = model.getComponentsInChildren(MeshRenderer);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const r of renderers) {
        const lo = r.mesh?.minPosition;
        const hi = r.mesh?.maxPosition;
        if (!lo || !hi) continue;
        minX = Math.min(minX, lo.x);
        minY = Math.min(minY, lo.y);
        minZ = Math.min(minZ, lo.z);
        maxX = Math.max(maxX, hi.x);
        maxY = Math.max(maxY, hi.y);
        maxZ = Math.max(maxZ, hi.z);
    }
    if (!isFinite(minX)) {
        minX = minY = minZ = maxX = maxY = maxZ = 0;
    }
    return [renderers.length, minX, minY, minZ, maxX, maxY, maxZ];
}

/**
 * 从单个 MeshRenderer 提取三角形碎片：按每组 2~3 个三角形左右（总量受 shardCap
 * 限制）拆成多个小网格的原始数据，以 ShardBlob 形式写入 out（数据 + 来源节点路径）。
 * 切网格与解体模式无关（运动参数由调用方按模式赋予），故结果可按档位缓存复用。
 * 大模型性能/正确性要点：
 *  - 全程复用 TypedArray 缓冲区 + 整表索引去重，不用 Map 与 JS 数组（海量小分配是卡顿主因）；
 *  - 属性读取支持外部预读（preloaded）：预热读一次、全部档位复用，避免每档
 *    重复 readAttribute 全量拷贝；
 *  - utils.createMesh 仅支持 R16UI 索引（顶点 ≤ 65535），组内按 FX_MAX_TRIS_PER_SHARD
 *    切块，避免超大模型单组顶点超限时索引静默回绕错画；
 *  - 档位已满时每个子网格仍至少保留 1 组，保证全覆盖、不漏画。
 * @param root 模型根节点：来源节点以「模型内路径」记录（模型每次进入都是新实例，不能存引用）
 * @param shardCap 本次特效的碎片总量上限（碎裂三档为 10/60/120，其余为 FX_MAX_SHARDS）
 * @param preloaded 外部预读的子网格属性（见 readSubMeshes），缺省则现场读取
 * @return 本次生成的碎片数
 */
export function extractShards(
    renderer: MeshRenderer,
    root: Node,
    out: ShardBlob[],
    shardCap: number,
    preloaded?: (SrcSubMesh | null)[],
): number {
    const mesh = renderer.mesh;
    if (!mesh) return 0;
    // 属性读取：优先用调用方预读的缓存（读一次切全部档位），否则现场读
    const subs = preloaded ?? readSubMeshes(renderer);
    const nodePath = nodePathWithin(renderer.node, root);
    let made = 0;

    for (let s = 0; s < subs.length; s++) {
        const sub = subs[s];
        if (!sub) continue;
        const { positions, normals, uvs, indices } = sub;

        const triCount = Math.floor(indices.length / 3);
        if (triCount <= 0) continue;

        // 分组大小：目标不超过 shardCap（含之前渲染器已生成的）；
        // 档位已满时也保证每个子网格至少 1 组，避免超出上限后整个子网格被漏画
        const remain = Math.max(1, shardCap - out.length);
        const perGroup = Math.max(1, Math.ceil(triCount / remain));

        // 三角形顺序确定性打乱，让相邻面随机落入不同碎片
        const order = new Int32Array(triCount);
        for (let t = 0; t < triCount; t++) order[t] = t;
        for (let t = triCount - 1; t > 0; t--) {
            const j = (t * 7919 + s * 104729 + made * 31) % (t + 1);
            const tmp = order[t];
            order[t] = order[j];
            order[j] = tmp;
        }

        // 顶点去重scratch：源顶点索引 → 新索引，-1 为未使用（比 Map 快一个量级）
        const vCount = positions.length / 3;
        const vMap = new Int32Array(vCount).fill(-1);
        // 组内还要按 16 位索引上限切块，缓冲区按块上限预分配一次，块间复用（避免每碎片重复分配）
        const chunkTris = Math.min(perGroup, FX_MAX_TRIS_PER_SHARD);
        const maxVerts = Math.min(vCount, chunkTris * 3);
        const bufPos = new Float32Array(maxVerts * 3);
        const bufNor = normals ? new Float32Array(maxVerts * 3) : null;
        const bufUv = uvs ? new Float32Array(maxVerts * 2) : null;
        const bufIdx = new Uint16Array(chunkTris * 3);
        // 新索引 → 源顶点索引，用于块末归还去重槽位
        const bufSrc = new Int32Array(maxVerts);

        for (let start = 0; start < triCount; start += perGroup) {
            const end = Math.min(start + perGroup, triCount);
            // 组内按 16 位索引顶点上限再切块：超大模型 + 小档位时单组顶点会超 65535，
            // utils.createMesh 仅支持 R16UI 索引，不切块会静默回绕错画（原实现的隐患）
            for (let cs = start; cs < end; cs += FX_MAX_TRIS_PER_SHARD) {
                const ce = Math.min(cs + FX_MAX_TRIS_PER_SHARD, end);
                let nv = 0;
                let ni = 0;
                for (let t = cs; t < ce; t++) {
                    const tri = order[t] * 3;
                    for (let k = 0; k < 3; k++) {
                        const src = indices[tri + k];
                        let dst = vMap[src];
                        if (dst === undefined || dst < 0) {
                            dst = nv++;
                            vMap[src] = dst;
                            bufSrc[dst] = src;
                            const p3 = src * 3;
                            bufPos[dst * 3] = positions[p3];
                            bufPos[dst * 3 + 1] = positions[p3 + 1];
                            bufPos[dst * 3 + 2] = positions[p3 + 2];
                            if (bufNor && normals) {
                                bufNor[dst * 3] = normals[p3];
                                bufNor[dst * 3 + 1] = normals[p3 + 1];
                                bufNor[dst * 3 + 2] = normals[p3 + 2];
                            }
                            if (bufUv && uvs) {
                                const t2 = src * 2;
                                bufUv[dst * 2] = uvs[t2];
                                bufUv[dst * 2 + 1] = uvs[t2 + 1];
                            }
                        }
                        bufIdx[ni++] = dst;
                    }
                }
                // 归还去重槽位（仅重置本块用到的，O(nv)）
                for (let d = 0; d < nv; d++) vMap[bufSrc[d]] = -1;

                out.push({
                    nodePath,
                    positions: bufPos.slice(0, nv * 3),
                    normals: bufNor ? bufNor.slice(0, nv * 3) : null,
                    uvs: bufUv ? bufUv.slice(0, nv * 2) : null,
                    indices: bufIdx.slice(0, ni),
                });
                made++;
            }
        }
    }
    return made;
}
