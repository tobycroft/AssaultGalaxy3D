import {
    _decorator,
    Color,
    Component,
    director,
    EventKeyboard,
    game,
    Graphics,
    Input,
    input,
    KeyCode,
    Label,
    Node,
    sys,
    UITransform,
} from 'cc';
import { pressEffect } from './UIAnim';
import { paintTechButton, TechText, techTextColor } from './TechUI';

const { ccclass } = _decorator;

/** UI 层 bitmask，与项目其余场景保持一致 */
const UI_LAYER = 33554432;

/**
 * 游戏内退出监听（挂在 Game 下各场景根节点上，场景 onLoad 中自动添加）：
 * - Android 原生：监听系统返回键（KeyCode.MOBILE_BACK）
 * - Windows / 浏览器等有键盘的环境：监听 ESC（KeyCode.ESCAPE）
 * 触发后弹出退出菜单：退出到主菜单（回 Home 场景）/ 关闭游戏（game.end()）/ 取消，
 * 再按一次键也可关闭弹窗。
 */
@ccclass('ExitOnBack')
export class ExitOnBack extends Component {
    private overlay: Node | null = null;
    /** 连按防抖时间戳（长按按键会产生重复 KEY_DOWN 事件） */
    private lastToggleAt = 0;

    onLoad(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.buildOverlay();
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(e: EventKeyboard): void {
        const trigger = sys.os === 'Android' ? KeyCode.MOBILE_BACK : KeyCode.ESCAPE;
        if (e.keyCode !== trigger) return;

        const now = Date.now();
        if (now - this.lastToggleAt < 300) return;
        this.lastToggleAt = now;

        if (this.overlay) this.overlay.active = !this.overlay.active;
    }

    /** 构建确认退出弹窗（默认隐藏，触发按键后显示） */
    private buildOverlay(): void {
        const layer = this.node.layer || UI_LAYER;

        const overlay = new Node('ExitOverlay');
        overlay.layer = layer;
        overlay.addComponent(UITransform).setContentSize(2000, 1200);

        // 全屏压暗：同时吞掉触摸事件，防止点穿到下层 UI
        const dim = new Node('Dim');
        dim.layer = layer;
        dim.addComponent(UITransform).setContentSize(2000, 1200);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(0, 0, 0, 170);
        dg.fillRect(-1000, -600, 2000, 1200);
        overlay.addChild(dim);

        // 面板
        const panelW = 520;
        const panelH = 400;
        const panel = new Node('Panel');
        panel.layer = layer;
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(18, 28, 46, 255);
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        pg.fill();
        pg.strokeColor = new Color(0, 190, 230, 255);
        pg.lineWidth = 2;
        pg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        pg.stroke();
        overlay.addChild(panel);

        // 标题 + 平台提示
        this.createLabel(panel, 'Title', '退出', 0, 150, 34, TechText.bright);
        const hint = sys.os === 'Android' ? '再按一次返回键可关闭本提示' : '再按一次 ESC 可关闭本提示';
        this.createLabel(panel, 'Hint', hint, 0, 110, 20, TechText.dim);

        // 退出到主菜单 / 关闭游戏 / 取消
        const home = this.createButton(panel, 'BtnHome', '退出到主菜单', 0, 40, 420, 56, 'primary', () => {
            this.overlay!.active = false;
            director.loadScene('Home');
        });
        pressEffect(home);
        const quit = this.createButton(panel, 'BtnQuit', '关闭游戏', 0, -30, 420, 56, 'danger', () => {
            // 原生 Android 直接退出 App；Web 端会尝试关闭当前页面
            game.end();
        });
        pressEffect(quit);
        const cancel = this.createButton(panel, 'BtnCancel', '取消', 0, -100, 420, 50, 'ghost', () => {
            overlay.active = false;
        });
        pressEffect(cancel);

        this.node.addChild(overlay);
        overlay.active = false;
        this.overlay = overlay;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
    ): Label {
        const n = new Node(name);
        n.layer = parent.layer;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(460, fontSize + 12);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
        return l;
    }

    private createButton(
        parent: Node,
        name: string,
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        kind: 'danger' | 'ghost',
        onClick: () => void,
    ): Node {
        const btn = new Node(name);
        btn.layer = parent.layer;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);

        const labNode = new Node('Label');
        labNode.layer = parent.layer;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = techTextColor(kind);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }
}
