import { Prefab, resources } from 'cc';

/** 预热扫描的模型根目录（resources 下） */
const MODEL_DIR = 'Model';

/**
 * 隐式预热全部 3D 模型：枚举 resources/Model 下的所有 Prefab（glb 导入产物），
 * 逐个加载进资源缓存。后续场景（Hangar / 战斗）再加载时直接命中缓存，消除卡顿。
 * 供 Intro 开场动画在打字机展示期间后台静默执行，无任何 UI 反馈。
 *
 * @param onDone 全部完成（或无可预热资源）后的回调；failed 为加载失败数量
 */
export function preheatModels(onDone?: (failed: number) => void): void {
    const infos = resources.getDirWithPath(MODEL_DIR, Prefab);
    if (!infos || infos.length === 0) {
        onDone?.(0);
        return;
    }
    let pending = infos.length;
    let failed = 0;
    infos.forEach((info) => {
        resources.load(info.path, Prefab, (err) => {
            if (err) failed++;
            pending--;
            if (pending <= 0) onDone?.(failed);
        });
    });
}
