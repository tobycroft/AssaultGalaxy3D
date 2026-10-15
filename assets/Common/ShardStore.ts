import { Mesh, native, sys, utils } from 'cc';

/**
 * 解体特效碎片模板的全局缓存（模块级单例，跨场景切换存活）。
 *
 * 背景：Debug 场景每次进入都会重新实例化模型并现场切碎片网格（大模型上数百毫秒），
 * 而切网格结果只取决于「源网格数据 + 档位」，与模型实例、解体模式无关，因此可固化复用：
 *  - 内存：按 prefab 资源 uuid + 档位 持有 utils.createMesh 生成的 Mesh，跨场景直接复用，
 *    重进场景零切割、零重复上传显存；
 *  - 磁盘（仅 native）：碎片原始数据落盘到 App 可写目录，下次启动读文件重建 Mesh，
 *    跳过切割（仅剩 GPU 上传）；浏览器预览无文件系统，自动走纯内存缓存。
 *
 * 注意：碎片模板不存来源节点引用——模型每次进入都是新实例，旧节点已销毁——
 * 只存「渲染节点在模型内的路径」，播放前由调用方按当前实例重新解析；材质同理在
 * 绑定时从当前实例的渲染器取（材质实例也不能跨场景复用）。
 */

/** 缓存格式版本：切割算法或落盘格式变更时 +1，旧缓存自动失效 */
const CACHE_VERSION = 1;
/** 磁盘缓存目录名（位于 App 可写路径下） */
const DISK_DIR = 'shard_cache';
/** 磁盘缓存文件数上限（超出按写入时间删最旧） */
const MAX_DISK_FILES = 30;
/** 磁盘缓存总字节上限（512MB，超出按写入时间删最旧） */
const MAX_DISK_BYTES = 512 * 1024 * 1024;
/** 反序列化 sanity 上限：防坏文件导致巨额分配 */
const MAX_SHARDS_SANITY = 100000;
const MAX_VERTS_SANITY = 10000000;
/** 落盘文件头 magic 'SHRD' */
const MAGIC = [0x53, 0x48, 0x52, 0x44];
/** 文件头字节数：magic4 + version2 + cap2 + shardCount4 */
const HEADER_SIZE = 12;
/** 几何指纹浮点数个数：渲染器数 + AABB 六分量 */
const FP_SIZE = 7;

/** 单个碎片的原始网格数据（可序列化，落盘与重建的基本单元） */
export interface ShardBlob {
    /** 来源渲染节点在模型内的路径（模型根节点为 ''，'/' 分隔） */
    nodePath: string;
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    indices: Uint16Array;
}

/** 运行时碎片模板：切好的网格 + 来源渲染节点路径（Mesh 跨场景复用，路径按实例重解析） */
export interface ShardEntry {
    mesh: Mesh;
    nodePath: string;
}

/** 磁盘索引条目（仅用于清理策略，不参与读取） */
interface DiskIndexEntry {
    file: string;
    bytes: number;
    time: number;
}

/** 4 字节对齐（TypedArray 视图要求 byteOffset 对齐，序列化按此插 Padding） */
function align4(offset: number): number {
    return (offset + 3) & ~3;
}

export class ShardStore {
    /** key = `${prefabUuid}|${cap}` → 碎片模板（Mesh 为运行时创建，跨场景复用） */
    private static entries = new Map<string, ShardEntry[]>();
    /** 模型 uuid 插入序，超出 maxModels 时淘汰最早插入模型的全部档位 */
    private static modelOrder: string[] = [];
    /** 内存中最多保留几个模型的碎片（每个模型 3 档 ≈ 3 倍模型顶点数据的内存 + 显存） */
    private static maxModels = 4;

    /** 仅 native 有文件系统；浏览器预览（sys.isNative=false）自动走纯内存缓存 */
    private static fileUtils(): typeof native.fileUtils | null {
        if (!sys.isNative) return null;
        try {
            return native.fileUtils ?? null;
        } catch {
            return null;
        }
    }

    public static keyOf(prefabUuid: string, cap: number): string {
        return `${prefabUuid}|${cap}`;
    }

    public static get(prefabUuid: string, cap: number): ShardEntry[] | undefined {
        return ShardStore.entries.get(ShardStore.keyOf(prefabUuid, cap));
    }

    public static has(prefabUuid: string, cap: number): boolean {
        return ShardStore.entries.has(ShardStore.keyOf(prefabUuid, cap));
    }

    /**
     * 写入内存缓存；超模型数上限时淘汰最早插入模型的全部档位。
     * 淘汰不 destroy Mesh：特效可能正在播放，且与既有 clear() 行为一致（GPU 随
     * JS 引用释放/场景销毁回收），避免悬挂引用导致渲染崩溃。
     */
    public static set(prefabUuid: string, cap: number, list: ShardEntry[]): void {
        ShardStore.entries.set(ShardStore.keyOf(prefabUuid, cap), list);
        if (!ShardStore.modelOrder.includes(prefabUuid)) {
            ShardStore.modelOrder.push(prefabUuid);
            while (ShardStore.modelOrder.length > ShardStore.maxModels) {
                const victim = ShardStore.modelOrder.shift()!;
                for (const k of [...ShardStore.entries.keys()]) {
                    if (k.startsWith(victim + '|')) ShardStore.entries.delete(k);
                }
            }
        }
    }

    /** 由原始碎片数据构建 Mesh（读盘重建与现场切割共用；数据拷贝进 GPU 缓冲） */
    public static buildEntries(blobs: ShardBlob[]): ShardEntry[] {
        return blobs.map((b) => ({
            mesh: utils.createMesh({
                positions: b.positions,
                normals: b.normals ?? undefined,
                uvs: b.uvs ?? undefined,
                indices: b.indices,
            }),
            nodePath: b.nodePath,
        }));
    }

    // ================= 磁盘缓存（仅 native） =================

    /**
     * 异步入盘：序列化 + 写文件可能耗时（大模型数十 MB），让出一帧避免卡预缓存尾帧。
     * 失败静默（内存缓存仍生效，仅损失下次启动的复用）。
     */
    public static saveDiskAsync(prefabUuid: string, cap: number, blobs: ShardBlob[], fingerprint: number[]): void {
        if (!ShardStore.fileUtils() || blobs.length === 0) return;
        setTimeout(() => {
            try {
                ShardStore.saveDisk(prefabUuid, cap, blobs, fingerprint);
            } catch {
                // 落盘失败仅影响下次启动复用，不影响本次会话
            }
        }, 0);
    }

    /**
     * 从磁盘读取碎片原始数据；不存在 / 版本不符 / 指纹失效 / 数据损坏一律返回 null
     * （调用方回退重新切割）。
     * @param fingerprint 当前模型的几何指纹，与文件头不一致视为模型已变更
     */
    public static loadDisk(prefabUuid: string, cap: number, fingerprint: number[] | null): ShardBlob[] | null {
        const fu = ShardStore.fileUtils();
        if (!fu) return null;
        const file = ShardStore.diskFilePath(prefabUuid, cap);
        if (!fu.isFileExist(file)) return null;
        let buf: ArrayBuffer;
        try {
            buf = fu.getDataFromFile(file);
        } catch {
            return null;
        }
        const blobs = ShardStore.deserialize(buf, cap, fingerprint);
        if (!blobs) {
            // 坏文件直接删，避免每次进入都反复解析失败
            ShardStore.removeFileSafe(file);
            return null;
        }
        return blobs;
    }

    private static saveDisk(prefabUuid: string, cap: number, blobs: ShardBlob[], fingerprint: number[]): void {
        const fu = ShardStore.fileUtils();
        if (!fu || blobs.length === 0) return;
        const dir = ShardStore.diskDir();
        if (!fu.isDirectoryExist(dir)) fu.createDirectory(dir);
        const file = ShardStore.diskFilePath(prefabUuid, cap);
        const buf = ShardStore.serialize(blobs, cap, fingerprint);
        if (!fu.writeDataToFile(buf, file)) return;
        ShardStore.pruneDisk({ file, bytes: buf.byteLength, time: Date.now() });
    }

    private static diskDir(): string {
        const fu = ShardStore.fileUtils()!;
        const root = fu.getWritablePath();
        return (root.endsWith('/') ? root : root + '/') + DISK_DIR + '/';
    }

    private static diskFilePath(prefabUuid: string, cap: number): string {
        return ShardStore.diskDir() + `${prefabUuid}_${cap}.bin`;
    }

    // ================= 序列化 =================

    /**
     * 二进制格式（小端）：
     *   [magic 4B 'SHRD'][version u16][cap u16][shardCount u32][指纹 7×f32]
     *   每碎片：[pathLen u16][path UTF-16 码元][flags u8][posCount u32][idxCount u32]
     *          [positions f32×3n][normals? f32×3n][uvs? f32×2n][indices u16×m]
     * 每个 TypedArray 段前插 Padding 做 4 字节对齐，读写均用视图整段拷贝（快）。
     * 源数据本就是 f32/u16（readAttribute / createMesh 输入），往返无损。
     */
    private static serialize(blobs: ShardBlob[], cap: number, fingerprint: number[]): ArrayBuffer {
        // 预计算总长（与写入同序模拟 offset，保证恰好覆盖）
        let size = HEADER_SIZE + FP_SIZE * 4;
        for (const b of blobs) {
            size += 2 + b.nodePath.length * 2 + 1 + 4 + 4;
            size = align4(size) + b.positions.length * 4;
            if (b.normals) size = align4(size) + b.normals.length * 4;
            if (b.uvs) size = align4(size) + b.uvs.length * 4;
            size = align4(size) + b.indices.length * 2;
        }
        const buf = new ArrayBuffer(size);
        const dv = new DataView(buf);
        let o = 0;
        for (const m of MAGIC) dv.setUint8(o++, m);
        dv.setUint16(o, CACHE_VERSION);
        o += 2;
        dv.setUint16(o, cap);
        o += 2;
        dv.setUint32(o, blobs.length);
        o += 4;
        for (let i = 0; i < FP_SIZE; i++) {
            dv.setFloat32(o, fingerprint[i] ?? 0);
            o += 4;
        }
        for (const b of blobs) {
            dv.setUint16(o, b.nodePath.length);
            o += 2;
            for (let i = 0; i < b.nodePath.length; i++) {
                dv.setUint16(o, b.nodePath.charCodeAt(i));
                o += 2;
            }
            dv.setUint8(o, (b.normals ? 1 : 0) | (b.uvs ? 2 : 0));
            o += 1;
            dv.setUint32(o, b.positions.length / 3);
            o += 4;
            dv.setUint32(o, b.indices.length);
            o += 4;
            o = ShardStore.writeF32(buf, o, b.positions);
            if (b.normals) o = ShardStore.writeF32(buf, o, b.normals);
            if (b.uvs) o = ShardStore.writeF32(buf, o, b.uvs);
            o = ShardStore.writeU16(buf, o, b.indices);
        }
        return buf;
    }

    private static writeF32(buf: ArrayBuffer, o: number, src: Float32Array): number {
        o = align4(o);
        new Float32Array(buf, o, src.length).set(src);
        return o + src.length * 4;
    }

    private static writeU16(buf: ArrayBuffer, o: number, src: Uint16Array): number {
        o = align4(o);
        new Uint16Array(buf, o, src.length).set(src);
        return o + src.length * 2;
    }

    /** 反序列化：任何校验失败返回 null（调用方删文件并回退重切） */
    private static deserialize(buf: ArrayBuffer, expectCap: number, expectFp: number[] | null): ShardBlob[] | null {
        if (buf.byteLength < HEADER_SIZE + FP_SIZE * 4) return null;
        const dv = new DataView(buf);
        let o = 0;
        for (const m of MAGIC) {
            if (dv.getUint8(o++) !== m) return null;
        }
        if (dv.getUint16(o) !== CACHE_VERSION) return null;
        o += 2;
        if (dv.getUint16(o) !== expectCap) return null;
        o += 2;
        const count = dv.getUint32(o);
        o += 4;
        if (count > MAX_SHARDS_SANITY) return null;
        const fp: number[] = [];
        for (let i = 0; i < FP_SIZE; i++) {
            fp.push(dv.getFloat32(o));
            o += 4;
        }
        if (expectFp && !fp.every((v, i) => Math.abs(v - (expectFp[i] ?? 0)) <= 1e-4)) return null;

        const out: ShardBlob[] = [];
        for (let s = 0; s < count; s++) {
            if (o + 2 > buf.byteLength) return null;
            const pathLen = dv.getUint16(o);
            o += 2;
            if (o + pathLen * 2 + 9 > buf.byteLength) return null;
            let nodePath = '';
            for (let i = 0; i < pathLen; i++) {
                nodePath += String.fromCharCode(dv.getUint16(o));
                o += 2;
            }
            const flags = dv.getUint8(o);
            o += 1;
            const posCount = dv.getUint32(o);
            o += 4;
            const idxCount = dv.getUint32(o);
            o += 4;
            if (posCount > MAX_VERTS_SANITY || idxCount > MAX_VERTS_SANITY * 3) return null;

            o = align4(o);
            if (o + posCount * 12 > buf.byteLength) return null;
            const positions = new Float32Array(new Float32Array(buf, o, posCount * 3));
            o += posCount * 12;

            let normals: Float32Array | null = null;
            if (flags & 1) {
                o = align4(o);
                if (o + posCount * 12 > buf.byteLength) return null;
                normals = new Float32Array(new Float32Array(buf, o, posCount * 3));
                o += posCount * 12;
            }
            let uvs: Float32Array | null = null;
            if (flags & 2) {
                o = align4(o);
                if (o + posCount * 8 > buf.byteLength) return null;
                uvs = new Float32Array(new Float32Array(buf, o, posCount * 2));
                o += posCount * 8;
            }
            o = align4(o);
            if (o + idxCount * 2 > buf.byteLength) return null;
            const indices = new Uint16Array(new Uint16Array(buf, o, idxCount));
            o += idxCount * 2;

            out.push({ nodePath, positions, normals, uvs, indices });
        }
        return out;
    }

    // ================= 磁盘清理 =================

    private static indexFile(): string {
        return ShardStore.diskDir() + 'index.json';
    }

    private static readIndex(): DiskIndexEntry[] {
        const fu = ShardStore.fileUtils();
        if (!fu) return [];
        try {
            const raw = fu.getStringFromFile(ShardStore.indexFile());
            if (!raw) return [];
            const data = JSON.parse(raw) as { version?: number; entries?: DiskIndexEntry[] };
            if (data.version !== CACHE_VERSION || !Array.isArray(data.entries)) return [];
            return data.entries.filter(
                (e) => e && typeof e.file === 'string' && typeof e.bytes === 'number' && typeof e.time === 'number',
            );
        } catch {
            return [];
        }
    }

    private static writeIndex(entries: DiskIndexEntry[]): void {
        const fu = ShardStore.fileUtils();
        if (!fu) return;
        try {
            fu.writeStringToFile(JSON.stringify({ version: CACHE_VERSION, entries }), ShardStore.indexFile());
        } catch {
            // 索引写失败仅影响清理策略
        }
    }

    /**
     * 清理策略：替换同文件旧记录 → 按写入时间删最旧直到满足数量/容量上限 →
     * 删除目录内不在索引中的散落 .bin（写盘中途被杀等残留）。
     */
    private static pruneDisk(saved: DiskIndexEntry): void {
        const fu = ShardStore.fileUtils();
        if (!fu) return;
        const entries = ShardStore.readIndex().filter((e) => e.file !== saved.file);
        entries.push(saved);
        entries.sort((a, b) => a.time - b.time);
        let total = entries.reduce((sum, e) => sum + e.bytes, 0);
        while (entries.length > MAX_DISK_FILES || total > MAX_DISK_BYTES) {
            const victim = entries.shift();
            if (!victim) break;
            ShardStore.removeFileSafe(victim.file);
            total -= victim.bytes;
        }
        ShardStore.writeIndex(entries);

        const dir = ShardStore.diskDir();
        const keep = new Set(entries.map((e) => ShardStore.baseName(e.file)));
        let files: string[] = [];
        try {
            files = fu.listFiles(dir);
        } catch {
            files = [];
        }
        for (const f of files) {
            const name = ShardStore.baseName(f);
            if (!name.endsWith('.bin') || keep.has(name)) continue;
            ShardStore.removeFileSafe(dir + name);
        }
    }

    private static baseName(path: string): string {
        const i = path.lastIndexOf('/');
        return i >= 0 ? path.substring(i + 1) : path;
    }

    private static removeFileSafe(file: string): void {
        const fu = ShardStore.fileUtils();
        if (!fu) return;
        try {
            if (fu.isFileExist(file)) fu.removeFile(file);
        } catch {
            // 删除失败不影响主流程
        }
    }
}
