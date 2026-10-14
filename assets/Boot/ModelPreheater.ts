import { Prefab, resources } from 'cc';

/** 预热扫描的模型根目录（resources 下） */
const MODEL_DIR = 'Model';

/**
 * 预热全部 3D 模型：枚举 resources/Model 下的所有 Prefab（glb 导入产物），
 * 逐个加载进资源缓存。后续场景（Hangar / 战斗）再加载时直接命中缓存，消除卡顿。
 * 供 Intro 开场以进度条显式展示加载进度。
 *
 * @param onProgress 每完成一个资源回调一次 (loaded, total)，用于驱动进度条
 * @param onDone     全部完成（或无可预热资源）后的回调；failed 为加载失败数量
 */
export function preheatModels(
    onProgress?: (loaded: number, total: number) => void,
    onDone?: (failed: number) => void,
): void {
    const infos = resources.getDirWithPath(MODEL_DIR, Prefab);
    if (!infos || infos.length === 0) {
        onProgress?.(1, 1);
        onDone?.(0);
        return;
    }
    const total = infos.length;
    let pending = total;
    let loaded = 0;
    let failed = 0;
    onProgress?.(0, total);
    infos.forEach((info) => {
        resources.load(info.path, Prefab, (err) => {
            if (err) failed++;
            pending--;
            loaded++;
            onProgress?.(loaded, total);
            if (pending <= 0) onDone?.(failed);
        });
    });
}
