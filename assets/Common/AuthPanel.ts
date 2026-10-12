import { Color, EditBox, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { fadeIn, fadeOutThen, pressEffect } from './UIAnim';
import { Api, AuthUser } from './Api';
import { Session } from './Session';

/** 认证模式：登录 / 注册 */
export type AuthMode = 'login' | 'register';

/** UI 层 bitmask，与项目 Settings.ts 保持一致 */
const UI_LAYER = 33554432;
/** 面板主色（深蓝按钮） */
const BTN_COLOR = new Color(45, 74, 122, 255);
const BTN_ACTIVE = new Color(255, 255, 255, 255);
const BTN_INACTIVE = new Color(150, 150, 150, 255);
const INPUT_BG = new Color(25, 40, 65, 255);
const INPUT_BORDER = new Color(120, 200, 255, 255);

/**
 * 登录 / 注册浮层（纯代码构建，不依赖 .scene）。
 * 通过 Home 菜单按钮唤起，调用后端 /v1/user/register 与 /v1/user/login，
 * 成功后用 Session 持久化 token，并触发 onSuccess 回调。
 */
export class AuthPanel {
    /** 登录/注册成功后的回调（拿到用户信息） */
    public onSuccess?: (user: AuthUser) => void;

    private parent: Node;
    private root: Node | null = null;
    private mode: AuthMode = 'login';
    private usernameBox!: EditBox;
    private passwordBox!: EditBox;
    private titleLabel!: Label;
    private submitBtn!: Node;
    private submitLabel!: Label;
    private switchLabel!: Label;
    private msgLabel!: Label;

    constructor(parent: Node) {
        this.parent = parent;
    }

    /** 打开浮层（可重复调用切换模式） */
    public open(mode: AuthMode): void {
        if (!this.root) this.build();
        this.mode = mode;
        this.applyMode();
        this.usernameBox.string = '';
        this.passwordBox.string = '';
        this.setMessage('');
        this.root!.active = true;
        fadeIn(this.root!, new Vec3(0, 30, 0), 0, 0.25);
    }

    /** 关闭浮层 */
    public close(): void {
        if (!this.root || !this.root.active) return;
        const r = this.root;
        fadeOutThen(r, 0.2, () => {
            r.active = false;
        });
    }

    /** 首次构建浮层节点（只构建一次，之后靠显隐复用） */
    private build(): void {
        const root = new Node('AuthPanel');
        root.layer = UI_LAYER;
        root.setPosition(0, 0, 0);

        // 全屏遮罩：拦截点击，避免穿透到下层 UI
        const mask = new Node('Mask');
        mask.layer = UI_LAYER;
        mask.addComponent(UITransform).setContentSize(2000, 1200);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 140);
        mg.fillRect(-1000, -600, 2000, 1200);
        mask.on(Node.EventType.TOUCH_START, () => {}, this);
        root.addChild(mask);

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
        fadeIn(this.titleLabel.node, new Vec3(0, 30, 0), 0, 0.3);

        // 用户名 / 密码输入框
        this.usernameBox = this.createEditBox(card, 'UsernameBox', '用户名（3-50 字符）', 0, 110, 420, 56, false, 50);
        this.passwordBox = this.createEditBox(card, 'PasswordBox', '密码（6-128 位）', 0, 35, 420, 56, true, 128);

        // 提交按钮
        this.submitBtn = this.createButton(card, 'Submit', '登录', 0, -45, 420, 56, () => this.onSubmit());
        pressEffect(this.submitBtn);
        this.submitLabel = this.submitBtn.getChildByName('Label')!.getComponent(Label)!;
        fadeIn(this.submitBtn, new Vec3(0, -20, 0), 0.25);

        // 模式切换文案
        const switchBtn = this.createButton(card, 'Switch', '没有账号？去注册', 0, -115, 280, 40, () => {
            this.open(this.mode === 'login' ? 'register' : 'login');
        });
        pressEffect(switchBtn);
        this.switchLabel = switchBtn.getChildByName('Label')!.getComponent(Label)!;
        this.switchLabel.color = new Color(120, 200, 255, 255);

        // 状态/错误提示
        this.msgLabel = this.createLabel(card, 'Message', '', 0, -165, 22, BTN_INACTIVE);
        this.msgLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        // 关闭按钮（右上角 ×）
        const closeBtn = this.createButton(card, 'Close', '×', cardW / 2 - 34, cardH / 2 - 34, 48, 48, () => this.close());
        pressEffect(closeBtn);
        const cl = closeBtn.getChildByName('Label')!.getComponent(Label)!;
        cl.color = BTN_INACTIVE;

        this.parent.addChild(root);
        this.root = root;
        root.active = false;
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
    }

    /** 提交：调用后端接口，成功则保存会话 */
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
                    ? await Api.register(username, password)
                    : await Api.login(username, password);

            if (resp.code === 0 && resp.data && (resp.data as AuthUser).token) {
                const user = resp.data as AuthUser;
                const uname = user.username || username;
                Session.save({ username: uname, token: user.token });
                this.setMessage('成功：' + (resp.echo || 'OK'));
                if (this.onSuccess) this.onSuccess(user);
                // 1 秒后自动关闭
                if (this.root) {
                    setTimeout(() => this.close(), 1000);
                }
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
        // 简易禁用：置灰提交按钮
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
    ): Node {
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        const g = btn.addComponent(Graphics);
        g.fillColor = BTN_COLOR;
        g.roundRect(-w / 2, -h / 2, w, h, 10);
        g.fill();

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = BTN_ACTIVE;
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

        // 背景（与按钮风格一致的圆角矩形）
        const g = node.addComponent(Graphics);
        g.fillColor = INPUT_BG;
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.fill();
        g.strokeColor = INPUT_BORDER;
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 8);
        g.stroke();

        const editBox = node.addComponent(EditBox);

        // 文本标签
        const textNode = new Node('textLabel');
        textNode.layer = UI_LAYER;
        textNode.addComponent(UITransform).setContentSize(w - 24, h);
        textNode.setPosition(-12, 0, 0);
        const textLabel = textNode.addComponent(Label);
        textLabel.string = '';
        textLabel.fontSize = 24;
        textLabel.color = BTN_ACTIVE;
        textLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        textLabel.verticalAlign = Label.VerticalAlign.CENTER;
        node.addChild(textNode);

        // 占位标签
        const phNode = new Node('placeholderLabel');
        phNode.layer = UI_LAYER;
        phNode.addComponent(UITransform).setContentSize(w - 24, h);
        phNode.setPosition(-12, 0, 0);
        const phLabel = phNode.addComponent(Label);
        phLabel.string = placeholder;
        phLabel.fontSize = 24;
        phLabel.color = BTN_INACTIVE;
        phLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        phLabel.verticalAlign = Label.VerticalAlign.CENTER;
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
