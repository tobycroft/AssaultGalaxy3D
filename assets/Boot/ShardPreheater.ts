import { Node, Prefab, MeshRenderer, resources, instantiate } from 'cc';
import { allShardCaps, ShardBlob, ShardStore } from '../Common/ShardStore';
import { extractShards, modelFingerprint, readSubMeshes, SrcSubMesh } from '../Common/ShardCutter';

/**
 * 开机预热解体特效碎片（Intro 开场调用，与 ModelPreheater 同风格）：
 * 实例化默认模型（路径序第一个 Prefab，与 Debug.loadModels 的默认模型选择一致），
 * 按全部档位（碎裂 10/60/120，非碎裂模式共用 FX_MAX_SHARDS=120）切好网格写入
 * ShardStore，全部档位完成后销毁实例（模板只存 Mesh + 节点路径，不依赖实例存活）。
 * 之后进入 Debug 场景播放任意解体特效直接命中缓存，读条期第二根进度条瞬间走完。
 *
 * 切割是大计算量同步操作（大模型每档数百毫秒），逐帧推进一档（tickShardPreheat
 * 由 Intro.update 驱动，与 Debug 的 precacheTick 同一模式），避免整段阻塞主线程
 * 导致进度条不动。不用 scheduleOnce 自调度链（同回调重复调度只告警不建定时器，
 * 一次性定时器回调后自注销会断链，见 Doc 8.2）。
 */

/** 预热扫描的模型根目录（resources 下，与 ModelPreheater 一致） */
const MODEL_DIR = 'Model';

/** 预热任务状态：档位队列 + 属性缓存，tick 每帧处理一档 */
let job: {
    /** 默认模型的 resources 路径（路径序第一个，与 Debug.loadModels 一致） */
    path: string;
    prefabUuid: string;
    /** 模型实例；null 表示 Prefab 尚未加载完（首帧异步加载，缓存命中通常当帧即回） */
    model: Node | null;
    /** 是否已发起 Prefab 加载（防每帧重复发起） */
    loading: boolean;
    caps: number[];
    total: number;
    /** 全部渲染器的子网格属性缓存：首次切割时读一次，后续档位复用（读一次切三档） */
    subs: Map<MeshRenderer, (SrcSubMesh | null)[]> | null;
    /** 当前模型的几何指纹：磁盘缓存失效校验用 */
    fingerprint: number[];
    onProgress: (done: number, total: number) => void;
    onDone: () => void;
} | null = null;

/**
 * 启动碎片预热：注册默认模型的档位队列（先回调一次 0% 画初始进度）。
 * 默认模型由首帧 tick 异步加载（Intro 中 ModelPreheater 已预热进缓存，命中即回）。
 * 无模型可预热时立即完成。重复调用会先放弃上一个任务。
 *
 * @param onProgress 每完成一档回调一次 (done, total)，用于驱动进度条
 * @param onDone     全部档位完成（或无可预热模型/加载失败）后的回调
 */
export function startShardPreheat(
    onProgress: (done: number, total: number) => void,
    onDone: () => void,
): void {
    cancelShardPreheat();

    const infos = resources.getDirWithPath(MODEL_DIR, Prefab);
    if (!infos || infos.length === 0) {
        onProgress(1, 1);
        onDone();
        return;
    }
    // 默认模型取路径序第一个（与 Debug.loadModels 一致，保证缓存 key 相同）
    const first = [...infos].sort((a, b) => a.path.localeCompare(b.path))[0];
    const caps = allShardCaps();
    job = {
        path: first.path,
        prefabUuid: '',
        model: null,
        loading: false,
        caps,
        total: caps.length,
        subs: null,
        fingerprint: [],
        onProgress,
        onDone,
    };
    onProgress(0, caps.length);
}

/**
 * 预热推进一档（由 Intro.update 每帧调用）：首帧异步加载默认模型并实例化，
 * 之后查缓存/切割当前档位，队列空了销毁模型实例并回调 onDone。无任务时为空操作。
 */
export function tickShardPreheat(): void {
    const cur = job;
    if (!cur) return;

    // 模型未就绪：发起异步加载（缓存命中通常当帧回调完成），等下一帧再推进
    if (!cur.model) {
        if (!cur.loading) {
            cur.loading = true;
            resources.load(cur.path, Prefab, (err, prefab) => {
                const j = job;
                if (!j || j !== cur) return; // 任务已取消/替换
                if (err || !prefab) {
                    finishJob(cur); // 加载失败：放弃预热，不影响 Intro 后续流程
                    return;
                }
                cur.prefabUuid = prefab.uuid;
                cur.model = instantiate(prefab);
                cur.fingerprint = modelFingerprint(cur.model);
            });
        }
        return;
    }

    const cap = cur.caps.shift();
    if (cap === undefined) {
        finishJob(cur);
        return;
    }
    if (!ShardStore.has(cur.prefabUuid, cap)) {
        // 命中顺序与 Debug 一致：native 磁盘缓存 → 现场切割（切完异步入盘）
        const diskBlobs = ShardStore.loadDisk(cur.prefabUuid, cap, cur.fingerprint);
        if (diskBlobs && diskBlobs.length > 0) {
            ShardStore.set(cur.prefabUuid, cap, ShardStore.buildEntries(diskBlobs));
        } else {
            if (!cur.subs) {
                cur.subs = new Map();
                // getComponentsInChildren 会一并遍历非激活节点，隐藏状态不影响提取
                for (const r of cur.model.getComponentsInChildren(MeshRenderer)) {
                    cur.subs.set(r, readSubMeshes(r));
                }
            }
            const blobs: ShardBlob[] = [];
            for (const [r, subs] of cur.subs) extractShards(r, cur.model!, blobs, cap, subs);
            if (blobs.length > 0) {
                ShardStore.set(cur.prefabUuid, cap, ShardStore.buildEntries(blobs));
                ShardStore.saveDiskAsync(cur.prefabUuid, cap, blobs, cur.fingerprint);
            }
        }
    }
    if (cur.caps.length === 0) cur.subs = null; // 全部档位处理完释放属性缓存
    cur.onProgress(cur.total - cur.caps.length, cur.total);
}

/** 放弃进行中的任务（Intro 场景销毁时调用，防回调击穿已毁组件） */
export function cancelShardPreheat(): void {
    const cur = job;
    job = null;
    if (cur?.model) cur.model.destroy();
}

/** 收尾：销毁模型实例（模板不依赖实例存活）并触发完成回调 */
function finishJob(cur: NonNullable<typeof job>): void {
    if (job === cur) job = null;
    if (cur.model) cur.model.destroy();
    cur.onDone();
}
