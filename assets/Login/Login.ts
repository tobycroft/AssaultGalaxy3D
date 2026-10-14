import { _decorator, Color, Component, director, EditBox, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { fadeIn, pressEffect } from '../Common/UIAnim';
import { paintTechButton, paintTechInput, TechButtonKind, techTextColor } from '../Common/TechUI';
import { login, register, userInfo, AuthUser, UserInfo } from '../Common/Api';
import { Session } from '../Common/Session';

/** 认证模式：登录 / 注册 */
type AuthMode = 'login' | 'register';

const { ccclass } = _decorator;

/** UI 层 bitmask，与项目 Settings.ts 保持一致 */
const UI_LAYER = 33554432;
const BTN_ACTIVE = new Color(235, 252, 255, 255);
const BTN_INACTIVE = new Color(120, 150, 175, 255);
const INPUT_BORDER = new Color(0, 190, 230, 255);
const BG_COLOR = new Color(12, 18, 30, 255);

/**
 * 独立的登录 / 注册页面（单独场景 Login.scene）。
 * 不挂在 Home 内，由 Home 菜单通过 director.loadScene('Login') 进入。
 * UI 在 onLoad 中纯代码构建（风格对齐 Settings.ts），调用后端
 * /v1/user/register 与 /v1/user/login，成功后用 Session 持久化 token 并返回首页。
 */
@ccclass('Login')
export class Login extends Component {
    private mode: AuthMode = 'login';
    private usernameBox!: EditBox;
    private passwordBox!: EditBox;
    private titleLabel!: Label;
    private submitBtn!: Node;
    private submitLabel!: Label;
    private switchLabel!: Label;
    private msgLabel!: Label;

    protected onLoad(): void {
        this.build();
        this.applyMode();
        fadeIn(this.node, new Vec3(0, 30, 0), 0, 0.25);
        // 本地已有 uid+token 时，先用 user/info 校验登录态，通过才进入首页
        this.tryResumeSession();
    }

    /**
     * 断点续登：本地已有 uid+token 时调用 user/info 校验登录态。
     * code=0 → 刷新用户名并进入首页；否则清登录态停留在登录页（网络错误仅提示，不清态）。
     */
    private async tryResumeSession(): Promise<void> {
        if (!Session.isLoggedIn()) return;
        this.setMessage('正在验证登录态…');
        try {
            const resp = await userInfo(Session.getUid(), Session.getToken());
            if (resp.code === 0) {
                const info = resp.data as UserInfo | undefined;
                const name = info && typeof info.username === 'string' ? info.username : '';
                if (name) Session.setUsername(name);
                director.loadScene('Home');
            } else {
                Session.clear();
                this.setMessage(resp.echo || '登录已失效，请重新登录');
            }
        } catch (e) {
            this.setMessage('网络错误：' + (e as Error).message);
        }
    }

    /** 构建登录/注册页面 UI */
    private build(): void {
        const root = this.node;

        // 背景
        const bg = new Node('Background');
        bg.layer = UI_LAYER;
        bg.addComponent(UITransform).setContentSize(2000, 1200);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = BG_COLOR;
        bgG.fillRect(-1000, -600, 2000, 1200);
        root.addChild(bg);

        // 卡片
        const cardW = 560;
        const cardH = 500;
        const card = new Node('Card');
        card.layer = UI_LAYER;
        card.addComponent(UITransform).setContentSize(cardW, cardH);
        const cg = card.addComponent(Graphics);
        cg.fillColor = new Color(18, 28, 46, 255);
        cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
        cg.fill();
        cg.strokeColor = INPUT_BORDER;
        cg.lineWidth = 2;
        cg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
        cg.stroke();
        root.addChild(card);

        // 标题
        this.titleLabel = this.createLabel(card, 'Title', '登录', 0, 200, 36);

        // 用户名 / 密码输入框
        this.usernameBox = this.createEditBox(card, 'UsernameBox', '用户名（3-50 字符）', 0, 110, 420, 56, false, 50);
        this.passwordBox = this.createEditBox(card, 'PasswordBox', '密码（6-128 位）', 0, 35, 420, 56, true, 128);

        // 提交按钮
        this.submitBtn = this.createButton(card, 'Submit', '登录', 0, -45, 420, 56, () => this.onSubmit());
        pressEffect(this.submitBtn);
        this.submitLabel = this.submitBtn.getChildByName('Label')!.getComponent(Label)!;

        // 模式切换文案
        const switchBtn = this.createButton(card, 'Switch', '没有账号？去注册', 0, -115, 280, 40, () => {
            this.mode = this.mode === 'login' ? 'register' : 'login';
            this.applyMode();
        }, 'ghost');
        pressEffect(switchBtn);
        this.switchLabel = switchBtn.getChildByName('Label')!.getComponent(Label)!;
        this.switchLabel.color = new Color(120, 200, 255, 255);

        // 状态/错误提示
        this.msgLabel = this.createLabel(card, 'Message', '', 0, -165, 22, BTN_INACTIVE);
        this.msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    }

    /** 根据当前模式刷新标题、按钮与切换文案 */
    private applyMode(): void {
        if (this.mode === 'login') {
            this.titleLabel.string = '登录';
            this.submitLabel.string = '登录';
            this.switchLabel.string = '没有账号？去注册';
        } else {
            this.titleLabel.string = '注册';
            this.submitLabel.string = '注册';
            this.switchLabel.string = '已有账号？去登录';
        }
        this.setMessage('');
    }

    /** 提交：调用后端接口，成功则保存会话并返回首页 */
    private async onSubmit(): Promise<void> {
        const username = this.usernameBox.string.trim();
        const password = this.passwordBox.string;
        if (username.length < 3 || username.length > 50) {
            this.setMessage('用户名需 3-50 个字符');
            return;
        }
        if (password.length < 6 || password.length > 128) {
            this.setMessage('密码需 6-128 位');
            return;
        }

        this.setMessage('请求中…');
        this.setBusy(true);
        try {
            const resp =
                this.mode === 'register'
                    ? await register(username, password)
                    : await login(username, password);

            if (resp.code === 0 && resp.data && (resp.data as AuthUser).token) {
                const user = resp.data as AuthUser;
                const uname = user.username || username;
                Session.save({
                    uid: user.id != null ? String(user.id) : '',
                    username: uname,
                    token: user.token,
                });
                this.setMessage('成功：' + (resp.echo || 'OK'));
                // 1 秒后返回首页
                this.scheduleOnce(() => director.loadScene('Home'), 1);
            } else {
                this.setMessage(resp.echo || '操作失败');
            }
        } catch (e) {
            this.setMessage('网络错误：' + (e as Error).message);
        } finally {
            this.setBusy(false);
        }
    }

    private setMessage(text: string): void {
        if (this.msgLabel) this.msgLabel.string = text;
    }

    private setBusy(busy: boolean): void {
        if (this.submitBtn) {
            const l = this.submitBtn.getChildByName('Label')!.getComponent(Label)!;
            l.color = busy ? BTN_INACTIVE : BTN_ACTIVE;
        }
    }

    // ---------- 通用 UI 构件（风格对齐 Settings.ts） ----------

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color = BTN_ACTIVE,
    ): Label {
        const n = new Node(name);
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(420, fontSize + 12);
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
        onClick?: () => void,
        kind: TechButtonKind = 'primary',
    ): Node {
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
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

    /** 创建输入框（EditBox），含背景与文本/占位标签 */
    private createEditBox(
        parent: Node,
        name: string,
        placeholder: string,
        x: number,
        y: number,
        w: number,
        h: number,
        password: boolean,
        maxLength: number,
    ): EditBox {
        const node = new Node(name);
        node.layer = UI_LAYER;
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(w, h);

        // 背景必须挂在子节点上：EditBox 启用时会自动给自身节点 addComponent(Sprite)
        // 作为背景（引擎 _ensureBackgroundSprite），与同节点的 Graphics 冲突，
        // 编辑器内预览会报 "Can't add component 'cc.Sprite' ... conflicts with 'cc.Graphics'"。
        const bgNode = new Node('Background');
        bgNode.layer = UI_LAYER;
        bgNode.addComponent(UITransform).setContentSize(w, h);
        paintTechInput(bgNode.addComponent(Graphics), w, h);
        node.addChild(bgNode);

        const editBox = node.addComponent(EditBox);

        // 文本标签：EditBox 会把 textLabel/placeholderLabel 重排到输入框左上角
        // （引擎 _resizeChildNodes/_updateLabelPosition），故必须用左上锚点 (0,1)，
        // 否则默认中心锚点会让左对齐文本渲染到框外（错位）。
        const textNode = new Node('textLabel');
        textNode.layer = UI_LAYER;
        const textUT = textNode.addComponent(UITransform);
        textUT.setAnchorPoint(0, 1);
        textUT.setContentSize(w - 24, h);
        textNode.setPosition(-w / 2 + 14, h / 2, 0);
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 24;
        textLabel.color = BTN_ACTIVE;
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;
        textLabel.overflow = Label.Overflow.NONE;
        node.addChild(textNode);

        const phNode = new Node('placeholderLabel');
        phNode.layer = UI_LAYER;
        const phUT = phNode.addComponent(UITransform);
        phUT.setAnchorPoint(0, 1);
        phUT.setContentSize(w - 24, h);
        phNode.setPosition(-w / 2 + 14, h / 2, 0);
        const phLabel = phNode.addComponent(Label);
        phLabel.string = placeholder;
        phLabel.fontSize = 24;
        phLabel.color = BTN_INACTIVE;
        phLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        phLabel.verticalAlign = Label.VerticalAlign.CENTER;
        phLabel.overflow = Label.Overflow.NONE;
        node.addChild(phNode);

        editBox.textLabel = textLabel;
        editBox.placeholderLabel = phLabel;
        editBox.placeholder = placeholder;
        editBox.string = '';
        editBox.maxLength = maxLength;
        editBox.inputMode = EditBox.InputMode.SINGLE_LINE;
        if (password) editBox.inputFlag = EditBox.InputFlag.PASSWORD;

        parent.addChild(node);
        return editBox;
    }
}
