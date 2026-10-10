import { Node, tween, UIOpacity, Vec3 } from 'cc';

/** 获取节点上的 UIOpacity，没有则添加 */
function opacity(node: Node): UIOpacity {
    let o = node.getComponent(UIOpacity);
    if (!o) o = node.addComponent(UIOpacity);
    return o;
}

/**
 * 入场动画：淡入并从 offset 位移回原位。
 * @param delay 延迟秒数（多节点错峰入场用）
 */
export function fadeIn(node: Node, offset: Vec3 = new Vec3(0, -30, 0), delay = 0, duration = 0.35): void {
    const target = node.position.clone();
    node.setPosition(target.x + offset.x, target.y + offset.y, target.z + offset.z);
    const o = opacity(node);
    o.opacity = 0;
    tween(o).delay(delay).to(duration, { opacity: 255 }).start();
    tween(node).delay(delay).to(duration, { position: target }, { easing: 'cubicOut' }).start();
}

/** 入场动画：从 0.6 倍缩放弹出并淡入 */
export function popIn(node: Node, delay = 0, duration = 0.3): void {
    const o = opacity(node);
    o.opacity = 0;
    const target = node.scale.clone();
    node.setScale(target.x * 0.6, target.y * 0.6, target.z * 0.6);
    tween(o).delay(delay).to(duration, { opacity: 255 }).start();
    tween(node).delay(delay).to(duration, { scale: target }, { easing: 'backOut' }).start();
}

/** 为代码创建的按钮（无 cc.Button 组件）添加按压缩放反馈 */
export function pressEffect(node: Node, pressScale = 0.9): void {
    const base = node.scale.clone();
    const pressed = new Vec3(base.x * pressScale, base.y * pressScale, base.z);
    node.on(Node.EventType.TOUCH_START, () => {
        tween(node).to(0.06, { scale: pressed }).start();
    });
    const release = () => {
        tween(node).to(0.12, { scale: base }, { easing: 'backOut' }).start();
    };
    node.on(Node.EventType.TOUCH_END, release);
    node.on(Node.EventType.TOUCH_CANCEL, release);
}

/** 整体淡出（含所有子 UI），结束后执行回调；用于切换场景前的过渡 */
export function fadeOutThen(node: Node, duration: number, then: () => void): void {
    const o = opacity(node);
    tween(o).to(duration, { opacity: 0 }).call(then).start();
}
