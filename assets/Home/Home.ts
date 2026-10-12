import { _decorator, Component, director, Node, Vec3, Color, UITransform, Graphics, Label } from 'cc';
import { fadeIn, fadeOutThen, popIn, pressEffect } from '../Common/UIAnim';
import { MusicManager } from '../Common/MusicManager';
import { SettingsStore } from '../Common/SettingsStore';
import { AuthPanel } from '../Common/AuthPanel';
import { Session } from '../Common/Session';

const { ccclass } = _decorator;

/**
 * 首页控制器。
 * 负责 “Debug” 调试按钮入口、菜单 / UI 的入场动画、切换场景过渡，以及背景音乐开关。
 */
@ccclass('Home')
export class Home extends Component {
    private switching = false;
    /** 登录/注册浮层实例（懒构建，复用以避免重复节点） */
    private authPanel: AuthPanel | null = null;
    /** 登录入口按钮文案（登录后显示为用户名） */
    private loginBtnLabel: Label | null = null;

    start(): void {
        SettingsStore.applyGraphics();
        MusicManager.init();
        this.playEnterAnim();
        this.createMusicToggle();
        this.bindSettingsButton();
        this.bindAuthButtons();
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
        const g = btn.addComponent(Graphics);
        g.fillColor = new Color(45, 74, 122, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 10);
        g.fill();

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
            l.color = on ? new Color(255, 255, 255, 255) : new Color(150, 150, 150, 255);
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

    /** 登录/注册入口：底部两个按钮，点击唤起认证浮层 */
    private bindAuthButtons(): void {
        const canvas = this.node.parent;
        if (!canvas) return;
        if (!this.authPanel) this.authPanel = new AuthPanel(canvas);
        this.authPanel.onSuccess = (user): void => {
            // 登录/注册成功后，入口按钮文案改为用户名
            if (this.loginBtnLabel) this.loginBtnLabel.string = user.username;
        };

        const loggedIn = Session.isLoggedIn();
        const loginBtn = this.createAuthButton(
            canvas,
            'BtnLogin',
            loggedIn ? Session.getUsername() || '已登录' : '登录',
            -110,
            -310,
            200,
            52,
            (): void => {
                if (Session.isLoggedIn()) return;
                this.authPanel!.open('login');
            },
        );
        pressEffect(loginBtn);
        this.loginBtnLabel = loginBtn.getChildByName('Label')!.getComponent(Label)!;
        fadeIn(loginBtn, new Vec3(0, 30, 0), 0.5);

        const registerBtn = this.createAuthButton(
            canvas,
            'BtnRegister',
            '注册',
            110,
            -310,
            200,
            52,
            (): void => {
                this.authPanel!.open('register');
            },
        );
        pressEffect(registerBtn);
        fadeIn(registerBtn, new Vec3(0, 30, 0), 0.55);
    }

    /** 自绘圆角按钮（风格对齐 Settings.ts） */
    private createAuthButton(
        parent: Node,
        name: string,
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        onClick?: () => void,
    ): Node {
        const btn = new Node(name);
        btn.layer = this.node.parent!.layer;
        btn.setPosition(x, y, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        const g = btn.addComponent(Graphics);
        g.fillColor = new Color(45, 74, 122, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 10);
        g.fill();

        const labNode = new Node('Label');
        labNode.layer = this.node.parent!.layer;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = new Color(255, 255, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        if (onClick) btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }
}
