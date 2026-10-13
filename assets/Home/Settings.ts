import {
    _decorator,
    Component,
    Color,
    director,
    EventTouch,
    game,
    Graphics,
    Label,
    Node,
    UITransform,
    Vec3,
} from 'cc';
import { fadeIn, fadeOutThen, pressEffect } from '../Common/UIAnim';
import { MusicManager } from '../Common/MusicManager';
import { SettingsStore } from '../Common/SettingsStore';
import { Session } from '../Common/Session';
import { paintTechButton, TechButtonKind, techTextColor } from '../Common/TechUI';

const { ccclass } = _decorator;

// 与项目一致的 UI 样式常量
const UI_LAYER = 33554432;
const BTN_ACTIVE = new Color(235, 252, 255, 255);
const BTN_INACTIVE = new Color(120, 150, 175, 255);
/** Tab 选中高亮色调 */
const TAB_ACTIVE = new Color(0, 214, 255, 255);

/** 设置页 Tab：游戏设置 / 账号设置 */
type SettingsTab = 'game' | 'account';

interface OptionRow {
    /** 配置行标题 */
    title: string;
    /** 选项文案 → 写入 SettingsStore 的值 */
    options: { label: string; value: number | boolean }[];
    /** 当前已选值 */
    current: () => number | boolean;
    /** 选中某项后的生效逻辑 */
    apply: (value: number | boolean) => void;
}

/**
 * 设置场景控制器：全部 UI 代码创建（标题 / 返回 / Tab 栏 / 两个内容面板）。
 * 分为「游戏设置」（音量 / 帧率 / 画质）与「账号设置」（当前账号 / 退出登录）两个 Tab，
 * 配置通过 SettingsStore 持久化，进入场景时自动应用画质与帧率。
 */
@ccclass('Settings')
export class Settings extends Component {
    private optionRows: OptionRow[] = [];
    /** 每行选项按钮的 Label，用于刷新高亮 */
    private rowLabels: Label[][] = [];
    /** 当前 Tab */
    private currentTab: SettingsTab = 'game';
    /** Tab 按钮上的 Label，用于刷新高亮 */
    private tabLabels: Label[] = [];
    /** 两个内容面板：[0]=游戏设置 [1]=账号设置 */
    private panels: Node[] = [];
    /** 账号面板控件 */
    private accountNameLabel!: Label;
    private accountHintLabel!: Label;
    private goLoginBtn!: Node;
    private logoutBtn!: Node;

    start(): void {
        SettingsStore.applyGraphics();
        this.optionRows = this.buildRows();
        this.buildUI();
    }

    private buildRows(): OptionRow[] {
        return [
            {
                title: '帧率',
                options: [
                    { label: '30 FPS', value: 30 },
                    { label: '60 FPS', value: 60 },
                    { label: '90 FPS', value: 90 },
                    { label: '144 FPS', value: 144 },
                    { label: '无限', value: 999 },
                ],
                current: () => SettingsStore.get('frameRate'),
                apply: (v) => {
                    game.frameRate = v as number;
                    SettingsStore.set('frameRate', v as number);
                },
            },
            {
                title: '画质',
                options: [
                    { label: '流畅', value: 0.6 },
                    { label: '均衡', value: 0.8 },
                    { label: '高清', value: 1.0 },
                ],
                current: () => SettingsStore.get('shadingScale'),
                apply: (v) => {
                    SettingsStore.set('shadingScale', v as number);
                    SettingsStore.applyGraphics();
                },
            },
        ];
    }

    /** 构建设置界面：标题 + 返回按钮 + Tab 栏 + 两个内容面板 */
    private buildUI(): void {
        const canvas = this.node;
        canvas.layer = UI_LAYER;

        // 标题
        const title = this.createLabel(canvas, 'Title', '设置', 0, 300, 40);
        fadeIn(title.node, new Vec3(0, 40, 0), 0, 0.4);

        // 返回按钮（左上角）
        const back = this.createButton(canvas, 'BtnBack', '← 返回首页', -520, 300, 200, 56, () => {
            fadeOutThen(canvas, 0.2, () => director.loadScene('Home'));
        });
        pressEffect(back);
        fadeIn(back, new Vec3(-60, 0, 0), 0.15);

        // Tab 栏 + 两个内容面板
        this.buildTabs(canvas);
        this.buildGamePanel(canvas);
        this.buildAccountPanel(canvas);

        // 默认显示游戏设置
        this.switchTab('game');
    }

    /** Tab 栏：游戏设置 / 账号设置 */
    private buildTabs(canvas: Node): void {
        const defs: { key: SettingsTab; label: string; x: number }[] = [
            { key: 'game', label: '游戏设置', x: -90 },
            { key: 'account', label: '账号设置', x: 90 },
        ];
        defs.forEach((d, i) => {
            const btn = this.createButton(canvas, 'Tab_' + d.key, d.label, d.x, 240, 170, 52, () => {
                this.switchTab(d.key);
            }, 'ghost');
            pressEffect(btn);
            fadeIn(btn, new Vec3(0, -20, 0), 0.1 + i * 0.06);
            this.tabLabels.push(btn.getChildByName('Label')!.getComponent(Label)!);
        });
    }

    /** 切换 Tab：刷新高亮与面板显隐，账号 Tab 刷新登录态 */
    private switchTab(key: SettingsTab): void {
        this.currentTab = key;
        this.tabLabels[0].color = key === 'game' ? TAB_ACTIVE : BTN_INACTIVE;
        this.tabLabels[1].color = key === 'account' ? TAB_ACTIVE : BTN_INACTIVE;
        this.panels[0].active = key === 'game';
        this.panels[1].active = key === 'account';
        if (key === 'account') this.refreshAccount();
    }

    /** 游戏设置面板：音量滑块 + 帧率 / 画质选项行 */
    private buildGamePanel(canvas: Node): void {
        const panel = new Node('Panel_Game');
        panel.layer = UI_LAYER;
        canvas.addChild(panel);
        this.panels[0] = panel;

        // 音量行：滑块
        this.buildVolumeSlider(panel, 160);

        // 帧率 / 画质行：选项按钮
        const startY = 30;
        const rowGap = 130;
        this.optionRows.forEach((row, i) => {
            const y = startY - i * rowGap;
            const caption = this.createLabel(panel, 'Caption_' + row.title, row.title, -400, y, 30,
                new Color(120, 200, 255, 255));
            caption.horizontalAlign = Label.HorizontalAlign.LEFT;
            fadeIn(caption.node, new Vec3(-40, 0, 0), 0.2 + i * 0.1);
            this.createOptionButtons(row, panel, 80, y, 0.25 + i * 0.1);
        });
    }

    /** 账号设置面板：当前账号 + 登录 / 退出（按登录态切换） */
    private buildAccountPanel(canvas: Node): void {
        const panel = new Node('Panel_Account');
        panel.layer = UI_LAYER;
        canvas.addChild(panel);
        this.panels[1] = panel;

        const caption = this.createLabel(panel, 'Caption_Account', '账号', -400, 160, 30,
            new Color(120, 200, 255, 255));
        caption.horizontalAlign = Label.HorizontalAlign.LEFT;
        fadeIn(caption.node, new Vec3(-40, 0, 0), 0.2);

        // 当前用户名 / 登录态
        this.accountNameLabel = this.createLabel(panel, 'AccountName', '', 0, 90, 34, BTN_ACTIVE);
        fadeIn(this.accountNameLabel.node, new Vec3(0, -20, 0), 0.25);

        // 状态提示
        this.accountHintLabel = this.createLabel(panel, 'AccountHint', '', 0, 40, 22, BTN_INACTIVE);
        fadeIn(this.accountHintLabel.node, new Vec3(0, -20, 0), 0.3);

        // 未登录：去登录 / 注册
        this.goLoginBtn = this.createButton(panel, 'BtnGoLogin', '去登录 / 注册', 0, -50, 260, 56, () => {
            fadeOutThen(this.node, 0.2, () => director.loadScene('Login'));
        });
        pressEffect(this.goLoginBtn);
        fadeIn(this.goLoginBtn, new Vec3(0, -20, 0), 0.35);

        // 已登录：退出登录
        this.logoutBtn = this.createButton(panel, 'BtnLogout', '退出登录', 0, -50, 260, 56,
            () => this.onLogout(), 'danger');
        pressEffect(this.logoutBtn);
        fadeIn(this.logoutBtn, new Vec3(0, -20, 0), 0.35);
    }

    /** 刷新账号面板：根据登录态显示用户名 / 提示，并切换登录或退出按钮 */
    private refreshAccount(): void {
        const loggedIn = Session.isLoggedIn();
        const name = Session.getUsername();
        this.accountNameLabel.string = loggedIn ? (name || '已登录') : '未登录';
        this.accountHintLabel.string = loggedIn ? '当前已登录的账号' : '登录后即可使用账号相关功能';
        this.goLoginBtn.active = !loggedIn;
        this.logoutBtn.active = loggedIn;
    }

    /** 退出登录：清空会话并回到登录页（未登录统一停留在登录界面） */
    private onLogout(): void {
        Session.clear();
        fadeOutThen(this.node, 0.2, () => director.loadScene('Login'));
    }

    /** 背景音乐音量行：标题 + 滑块 + 百分比，拖动即时生效并持久化 */
    private buildVolumeSlider(parent: Node, y: number): void {
        const caption = this.createLabel(parent, 'Caption_Volume', '背景音乐音量', -400, y, 30,
            new Color(120, 200, 255, 255));
        caption.horizontalAlign = Label.HorizontalAlign.LEFT;
        fadeIn(caption.node, new Vec3(-40, 0, 0), 0.2);

        const pct = this.createLabel(parent, 'VolumePct', '', 430, y, 24);
        pct.color = BTN_ACTIVE;

        const slider = this.createSlider(parent, 100, y, 500, 24, SettingsStore.get('bgmVolume'),
            (v: number) => {
                const mm = MusicManager.get();
                if (mm) mm.setVolume(v);
                else SettingsStore.set('bgmVolume', v);
                pct.string = `${Math.round(v * 100)}%`;
            });
        fadeIn(slider, new Vec3(0, -20, 0), 0.25);
    }

    /** 自绘滑块：轨道 + 已填充部分 + 圆形手柄，点击/拖动即时回调 */
    private createSlider(parent: Node, x: number, y: number, w: number, h: number,
        init: number, onChange: (v: number) => void): Node {
        const node = new Node('Slider');
        node.layer = UI_LAYER;
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(w, h);

        // 手柄（子节点，横向移动）
        const handle = new Node('Handle');
        handle.layer = UI_LAYER;
        const handleSize = h + 10;
        handle.addComponent(UITransform).setContentSize(handleSize, handleSize);
        const hg = handle.addComponent(Graphics);
        hg.fillColor = new Color(0, 214, 255, 255);
        hg.circle(0, 0, handleSize / 2);
        hg.fill();
        hg.fillColor = new Color(235, 252, 255, 255);
        hg.circle(0, 0, handleSize / 2 - 5);
        hg.fill();
        node.addChild(handle);

        // 轨道与填充条（每次变化重绘）
        const g = node.addComponent(Graphics);
        const drawBar = (p: number): void => {
            g.clear();
            g.fillColor = new Color(20, 40, 66, 255);
            g.roundRect(-w / 2, -h / 2, w, h, h / 2);
            g.fill();
            const fw = Math.max(h, p * w);
            g.fillColor = new Color(0, 150, 200, 255);
            g.roundRect(-w / 2, -h / 2, fw, h, h / 2);
            g.fill();
            g.fillColor = new Color(0, 229, 255, 255);
            g.roundRect(-w / 2, -h / 2 + h * 0.28, fw, h * 0.44, h * 0.22);
            g.fill();
        };
        const setProgress = (v: number): void => {
            const p = Math.min(1, Math.max(0, v));
            drawBar(p);
            handle.setPosition(-w / 2 + p * w, 0, 0);
            onChange(p);
        };

        const ut = node.getComponent(UITransform)!;
        const touchToProgress = (event: EventTouch): void => {
            const loc = event.getUILocation();
            const local = ut.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
            setProgress((local.x + w / 2) / w);
        };
        node.on(Node.EventType.TOUCH_START, touchToProgress, this);
        node.on(Node.EventType.TOUCH_MOVE, touchToProgress, this);
        node.on(Node.EventType.TOUCH_END, touchToProgress, this);

        setProgress(init);
        parent.addChild(node);
        return node;
    }

    /** 为一行配置生成选项按钮（当前选中项高亮白字，其余灰色） */
    private createOptionButtons(row: OptionRow, parent: Node, x: number, y: number, delay: number): void {
        const labels: Label[] = [];
        // 选项超过 4 个时收窄间距，避免整行超出画布
        const gap = row.options.length > 4 ? 115 : 140;
        row.options.forEach((opt, i) => {
            const ox = x + i * gap;
            const active = row.current() === opt.value;
            const btn = this.createButton(parent, 'Opt_' + opt.label, opt.label, ox, y, 120, 52, () => {
                row.apply(opt.value);
                row.options.forEach((o2, j) => {
                    labels[j].color = o2.value === opt.value ? BTN_ACTIVE : BTN_INACTIVE;
                });
            }, 'ghost');
            pressEffect(btn);
            fadeIn(btn, new Vec3(0, -20, 0), delay + i * 0.06);
            const l = btn.getChildByName('Label')!.getComponent(Label)!;
            l.color = active ? BTN_ACTIVE : BTN_INACTIVE;
            labels.push(l);
        });
        this.rowLabels.push(labels);
    }

    private createLabel(parent: Node, name: string, text: string, x: number, y: number,
        fontSize: number, color: Color = new Color(255, 255, 255, 255)): Label {
        const n = new Node(name);
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(360, fontSize + 12);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
        return l;
    }

    private createButton(parent: Node, name: string, label: string, x: number, y: number,
        w: number, h: number, onClick?: () => void, kind: TechButtonKind = 'primary'): Node {
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        const ut = btn.addComponent(UITransform);
        ut.setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        const lut = labNode.addComponent(UITransform);
        lut.setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = techTextColor(kind);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        if (onClick) btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }
}
