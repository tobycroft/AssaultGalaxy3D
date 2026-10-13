import { Color, Graphics } from 'cc';

/**
 * 科技感 UI 绘制工具：深色底 + 霓虹描边 + HUD 高亮装饰。
 * 全部使用 roundRect 绘制（本项目已验证可正常渲染；自定义 moveTo/lineTo 路径在本引擎
 * Web 端不渲染，故避免使用）。供 Login / Home / Settings 的代码自绘按钮、输入框复用。
 */

/** 按钮风格：primary 主操作 / ghost 次要 / danger 危险（退出） */
export type TechButtonKind = 'primary' | 'ghost' | 'danger';

/** 科技风文本配色 */
export const TechText = {
    primary: new Color(228, 250, 255, 255),
    ghost: new Color(158, 196, 220, 255),
    danger: new Color(255, 206, 216, 255),
    dim: new Color(120, 150, 175, 255),
    bright: new Color(235, 252, 255, 255),
    caption: new Color(120, 214, 255, 255),
};

const FILL = {
    primary: new Color(15, 36, 63, 240),
    ghost: new Color(13, 26, 45, 210),
    danger: new Color(46, 18, 32, 240),
};
const EDGE = {
    primary: new Color(0, 214, 255, 255),
    ghost: new Color(64, 124, 162, 255),
    danger: new Color(255, 72, 110, 255),
};
const ACCENT = {
    primary: new Color(125, 240, 255, 255),
    ghost: new Color(90, 150, 190, 255),
    danger: new Color(255, 150, 175, 255),
};

function pick<T>(kind: TechButtonKind, map: Record<TechButtonKind, T>): T {
    return map[kind] ?? map.primary;
}

/**
 * 绘制科技感按钮背景（深色底 + 霓虹描边 + 顶部高光 + 左下角亮线）。
 * @param g    Graphics 组件
 * @param w    宽
 * @param h    高
 * @param kind 风格
 */
export function paintTechButton(
    g: Graphics,
    w: number,
    h: number,
    kind: TechButtonKind = 'primary',
): void {
    const r = Math.max(6, Math.min(12, h * 0.22));
    const fill = pick(kind, FILL);
    const edge = pick(kind, EDGE);
    const accent = pick(kind, ACCENT);
    const x0 = -w / 2;
    const y0 = -h / 2;

    g.clear();
    // 深色底
    g.fillColor = fill;
    g.roundRect(x0, y0, w, h, r);
    g.fill();
    // 霓虹描边
    g.strokeColor = edge;
    g.lineWidth = 2;
    g.roundRect(x0, y0, w, h, r);
    g.stroke();
    // 顶部内高光（细长圆角条）
    g.fillColor = new Color(edge.r, edge.g, edge.b, 90);
    g.roundRect(x0 + r + 4, y0 + h - 4, w - (r + 4) * 2, 2, 1);
    g.fill();
    // 左下角短亮线（HUD 装饰）
    g.fillColor = accent;
    g.roundRect(x0 + 5, y0 + 5, Math.min(22, w * 0.14), 3, 1);
    g.fill();
}

/** 绘制科技感输入框背景（深色底 + 青色描边 + 左侧亮条） */
export function paintTechInput(g: Graphics, w: number, h: number): void {
    const cut = Math.max(5, Math.min(10, h * 0.2));
    const x0 = -w / 2;
    const y0 = -h / 2;

    g.clear();
    g.fillColor = new Color(11, 24, 43, 245);
    g.roundRect(x0, y0, w, h, cut);
    g.fill();
    g.strokeColor = new Color(0, 190, 230, 220);
    g.lineWidth = 2;
    g.roundRect(x0, y0, w, h, cut);
    g.stroke();
    // 左侧青色亮条
    g.fillColor = new Color(0, 214, 255, 255);
    g.roundRect(x0 + 2, y0 + cut + 1, 3, h - (cut + 1) * 2, 1);
    g.fill();
}

/** 按风格返回默认文字颜色 */
export function techTextColor(kind: TechButtonKind): Color {
    if (kind === 'danger') return TechText.danger;
    if (kind === 'ghost') return TechText.ghost;
    return TechText.primary;
}
