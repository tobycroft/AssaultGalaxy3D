/**
 * 启动流程状态：记录本次运行中开场 Intro 是否已播放。
 * 模块级变量随脚本上下文存活，跨场景切换不丢失（预览与构建包行为一致）。
 * Home 启动时据此保证：只要 Intro 没播过，一律先进 Intro（与编辑器启动场景设置无关）。
 */
let introPlayed = false;

export function markIntroPlayed(): void {
    introPlayed = true;
}

export function isIntroPlayed(): boolean {
    return introPlayed;
}
