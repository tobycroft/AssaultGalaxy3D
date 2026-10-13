import { _decorator, Component, director, game, Node, Vec3, Color, Button, Sprite, UITransform, Graphics, Label } from 'cc';
import { fadeIn, fadeOutThen, popIn, pressEffect } from '../Common/UIAnim';
import { MusicManager } from '../Common/MusicManager';
import { SettingsStore } from '../Common/SettingsStore';
import { Session } from '../Common/Session';
import { paintTechButton, paintTechInput, TechButtonKind, techTextColor } from '../Common/TechUI';

const { ccclass } = _decorator;

/**
 * 首页控制器。
 * 负责 “Debug” 调试按钮入口、菜单 / UI 的入场动画、切换场景过渡，以及背景音乐开关。
 * 登录 / 注册入口跳转到独立的 Login 场景（不在 Home 内实现）。
 */
@ccclass('Home')
export class Home extends Component {
    private switching = false;
    /** 退出确认框节点（打开时唯一，用于关闭/销毁） */
    private exitConfirmNode: Node | null = null;

    start(): void {
        SettingsStore.applyGraphics();
        MusicManager.init();
        // 未登录一律回到登录页（登录态已在 Login 场景通过 user/info 校验）
        if (!Session.isLoggedIn()) {
            director.loadScene('Login');
            return;
        }
        this.restyleMenuButtons();
        this.playEnterAnim();
        this.createMusicToggle();
        this.bindSettingsButton();
        this.bindExitButton();
        this.bindLoginEntry();
    }

    /** 点击 Debug 按钮：淡出后进入调试场景 */
    public onDebugClick(): void {
        this.switchScene('Debug');
    }

    /** 点击设置按钮：淡出后进入设置场景 */
    public onSettingsClick(): void {
        this.switchScene('Settings');
    }

    /** 代码绑定菜单面板中的设置按钮（场景中按钮未挂回调，统一由这里接管） */
    private bindSettingsButton(): void {
        const canvas = this.node.parent;
        const btn = canvas?.getChildByName('MenuPanel')?.getChildByName('BtnSettings');
        if (!btn) return;
        btn.on(Node.EventType.TOUCH_END, () => this.onSettingsClick(), this);
        pressEffect(btn);
    }

    /** 代码绑定菜单面板中的退出按钮：点击弹出退出确认框 */
    private bindExitButton(): void {
        const canvas = this.node.parent;
        const btn = canvas?.getChildByName('MenuPanel')?.getChildByName('BtnExit');
        if (!btn) return;
        btn.on(Node.EventType.TOUCH_END, () => this.openExitConfirm(), this);
        pressEffect(btn);
    }

    /** 入场动画：菜单面板从左侧滑入，面板内按钮依次上浮淡入，右下角按钮弹出 */
    private playEnterAnim(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        const panel = canvas.getChildByName('MenuPanel');
        if (panel) {
            fadeIn(panel, new Vec3(-240, 0, 0), 0, 0.45);
            panel.children.forEach((btn: Node, i: number) => {
                fadeIn(btn, new Vec3(0, -30, 0), 0.15 + i * 0.08);
            });
        }
        const debugBtn = canvas.getChildByName('BtnDebug');
        if (debugBtn) popIn(debugBtn, 0.45);
    }

    /** 淡出整个 UI 后切换场景 */
    private switchScene(name: string): void {
        if (this.switching) return;
        this.switching = true;
        const canvas = this.node.parent;
        if (canvas) {
            fadeOutThen(canvas, 0.2, () => director.loadScene(name));
        } else {
            director.loadScene(name);
        }
    }

    /** 右上角背景音乐开关按钮（样式与 Debug 界面按钮一致） */
    private createMusicToggle(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        const w = 170;
        const h = 52;

        const btn = new Node('BtnMusic');
        btn.layer = canvas.layer;
        btn.setPosition(540, 320, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, 'primary');

        const labNode = new Node('Label');
        labNode.layer = canvas.layer;
        const lut = labNode.addComponent(UITransform);
        lut.setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.fontSize = 24;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        const refresh = (): void => {
            const on = MusicManager.get()?.isOn ?? true;
            l.string = on ? '音乐：开' : '音乐：关';
            l.color = on ? new Color(235, 252, 255, 255) : new Color(120, 150, 175, 255);
        };
        refresh();

        btn.on(Node.EventType.TOUCH_END, () => {
            MusicManager.get()?.toggle();
            refresh();
        }, this);
        pressEffect(btn);

        canvas.addChild(btn);
        fadeIn(btn, new Vec3(0, 30, 0), 0.5);
    }

    /** 登录/注册入口：已登录则在左上角显示用户名，否则底部显示登录/注册按钮 */
    private bindLoginEntry(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        // 已登录：左上角展示当前用户名（退出登录后回到首页会自动消失）
        if (Session.isLoggedIn()) {
            this.showUserBadge(canvas);
            return;
        }
        const btn = this.createEntryButton(
            canvas,
            'BtnLoginEntry',
            '登录 / 注册',
            0,
            -310,
            220,
            52,
            (): void => this.switchScene('Login'),
        );
        pressEffect(btn);
        fadeIn(btn, new Vec3(0, 30, 0), 0.5);
    }

    /** 已登录时在左上角显示当前用户名（样式对齐右上角音乐开关） */
    private showUserBadge(canvas: Node): void {
        const raw = Session.getUsername() || '已登录';
        const name = raw.length > 12 ? `${raw.slice(0, 12)}…` : raw;
        const w = 280;
        const h = 52;

        const badge = new Node('UserBadge');
        badge.layer = canvas.layer;
        badge.setPosition(-520, 320, 0);
        const ut = badge.addComponent(UITransform);
        ut.setContentSize(w, h);
        paintTechInput(badge.addComponent(Graphics), w, h);

        const labNode = new Node('Label');
        labNode.layer = canvas.layer;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = name;
        l.fontSize = 24;
        l.color = new Color(200, 232, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        badge.addChild(labNode);

        canvas.addChild(badge);
        fadeIn(badge, new Vec3(-30, 0, 0), 0.5);
    }

    /** 自绘圆角按钮（风格对齐 Settings.ts），点击后带淡出切换场景 */
    private createEntryButton(
        parent: Node,
        name: string,
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        onClick?: () => void,
        kind: TechButtonKind = 'primary',
    ): Node {
        const btn = new Node(name);
        btn.layer = this.node.parent!.layer;
        btn.setPosition(x, y, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);

        const labNode = new Node('Label');
        labNode.layer = this.node.parent!.layer;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 26;
        l.color = techTextColor(kind);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        if (onClick) btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }

    /** 将场景自带的默认按钮（Sprite+Button）替换为科技风外观 */
    private restyleMenuButtons(): void {
        const canvas = this.node.parent;
        const panel = canvas?.getChildByName('MenuPanel');
        const targets: { node: Node | null | undefined; kind: TechButtonKind }[] = [
            { node: panel?.getChildByName('BtnStart'), kind: 'primary' },
            { node: panel?.getChildByName('BtnSettings'), kind: 'primary' },
            { node: panel?.getChildByName('BtnExit'), kind: 'danger' },
            { node: canvas?.getChildByName('BtnDebug'), kind: 'ghost' },
        ];
        targets.forEach((t) => {
            if (t.node) this.restyleSceneButton(t.node, t.kind);
        });
    }

    /** 去掉默认 Sprite，改绘科技风按钮背景，并提亮文字 */
    private restyleSceneButton(btn: Node, kind: TechButtonKind): void {
        const ut = btn.getComponent(UITransform);
        const w = ut ? ut.contentSize.width : 220;
        const h = ut ? ut.contentSize.height : 64;
        const sprite = btn.getComponent(Sprite);
        if (sprite) sprite.destroy();
        const button = btn.getComponent(Button);
        if (button) button.transition = Button.Transition.NONE;
        let g = btn.getComponent(Graphics);
        if (!g) g = btn.addComponent(Graphics);
        paintTechButton(g, w, h, kind);
        const label = btn.getChildByName('Label')?.getComponent(Label);
        if (label) {
            label.color = techTextColor(kind);
            label.fontSize = Math.max(22, Math.min(28, Math.round(h * 0.42)));
        }
    }

    /** 弹出退出确认框（半透明遮罩 + 面板 + 确认/取消），确认后调用 game.end() 退出 */
    private openExitConfirm(): void {
        const canvas = this.node.parent;
        if (!canvas || this.exitConfirmNode) return;
        const layer = canvas.layer;

        const root = new Node('ExitConfirm');
        root.layer = layer;

        // 半透明遮罩：点击遮罩视为取消
        const mask = new Node('Mask');
        mask.layer = layer;
        mask.addComponent(UITransform).setContentSize(1280, 720);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.fillRect(-640, -360, 1280, 720);
        mask.on(Node.EventType.TOUCH_END, () => this.closeExitConfirm(), this);
        root.addChild(mask);

        // 面板
        const pw = 440;
        const ph = 230;
        const panel = new Node('Panel');
        panel.layer = layer;
        panel.addComponent(UITransform).setContentSize(pw, ph);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(22, 34, 54, 255);
        pg.roundRect(-pw / 2, -ph / 2, pw, ph, 16);
        pg.fill();
        pg.strokeColor = new Color(120, 200, 255, 255);
        pg.lineWidth = 2;
        pg.roundRect(-pw / 2, -ph / 2, pw, ph, 16);
        pg.stroke();
        root.addChild(panel);

        // 文案
        this.createTextLabel(panel, 'Title', '退出游戏', 0, 68, 32, new Color(255, 255, 255, 255));
        this.createTextLabel(panel, 'Msg', '确认要退出游戏吗？', 0, 16, 22, new Color(170, 182, 198, 255));

        // 确认 / 取消
        const confirmBtn = this.createEntryButton(panel, 'BtnConfirm', '确认退出', -85, -55, 150, 52,
            () => game.end(), 'danger');
        pressEffect(confirmBtn);
        const cancelBtn = this.createEntryButton(panel, 'BtnCancel', '取消', 85, -55, 150, 52,
            () => this.closeExitConfirm());
        pressEffect(cancelBtn);

        canvas.addChild(root);
        this.exitConfirmNode = root;
        fadeIn(panel, new Vec3(0, -20, 0), 0, 0.2);
    }

    /** 关闭退出确认框 */
    private closeExitConfirm(): void {
        if (this.exitConfirmNode) {
            this.exitConfirmNode.destroy();
            this.exitConfirmNode = null;
        }
    }

    /** 对话框用居中文本标签 */
    private createTextLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
    ): Label {
        const n = new Node(name);
        n.layer = this.node.parent!.layer;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(400, fontSize + 12);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
        return l;
    }
}
