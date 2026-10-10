import {
    _decorator,
    Component,
    Color,
    director,
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

const { ccclass } = _decorator;

// 与项目一致的 UI 样式常量
const UI_LAYER = 33554432;
const BTN_COLOR = new Color(45, 74, 122, 255);
const BTN_ACTIVE = new Color(255, 255, 255, 255);
const BTN_INACTIVE = new Color(150, 150, 150, 255);

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
 * 设置场景控制器：全部 UI 代码创建（标题 / 返回 / 音量 / 帧率 / 画质）。
 * 配置通过 SettingsStore 持久化，进入场景时自动应用画质与帧率。
 */
@ccclass('Settings')
export class Settings extends Component {
    private optionRows: OptionRow[] = [];
    /** 每行选项按钮的 Label，用于刷新高亮 */
    private rowLabels: Label[][] = [];

    start(): void {
        SettingsStore.applyGraphics();
        this.optionRows = this.buildRows();
        this.buildUI();
    }

    private buildRows(): OptionRow[] {
        return [
            {
                title: '背景音乐音量',
                options: [
                    { label: '0%', value: 0 },
                    { label: '25%', value: 0.25 },
                    { label: '50%', value: 0.5 },
                    { label: '75%', value: 0.75 },
                    { label: '100%', value: 1 },
                ],
                current: () => SettingsStore.get('bgmVolume'),
                apply: (v) => MusicManager.get()?.setVolume(v as number),
            },
            {
                title: '帧率',
                options: [
                    { label: '30 FPS', value: 30 },
                    { label: '60 FPS', value: 60 },
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

    /** 构建设置界面：标题 + 返回按钮 + 三组配置行 */
    private buildUI(): void {
        const canvas = this.node;
        canvas.layer = UI_LAYER;

        // 标题
        const title = this.createLabel(canvas, 'Title', '设置', 0, 300, 40);
        fadeIn(title.node, new Vec3(0, 40, 0), 0, 0.4);

        // 返回按钮（左上角）
        const back = this.createButton(canvas, 'BtnBack', '← 返回首页', -500, 300, 200, 56, () => {
            fadeOutThen(canvas, 0.2, () => director.loadScene('Home'));
        });
        pressEffect(back);
        fadeIn(back, new Vec3(-60, 0, 0), 0.15);

        // 三组配置行：垂直排布
        const startY = 160;
        const rowGap = 130;
        this.optionRows.forEach((row, i) => {
            const y = startY - i * rowGap;
            const caption = this.createLabel(canvas, 'Caption_' + row.title, row.title, -400, y, 30,
                new Color(120, 200, 255, 255));
            caption.horizontalAlign = Label.HorizontalAlign.LEFT;
            fadeIn(caption.node, new Vec3(-40, 0, 0), 0.2 + i * 0.1);
            this.createOptionButtons(row, 80, y, 0.25 + i * 0.1);
        });
    }

    /** 为一行配置生成选项按钮（当前选中项高亮白字，其余灰色） */
    private createOptionButtons(row: OptionRow, x: number, y: number, delay: number): void {
        const canvas = this.node;
        const labels: Label[] = [];
        const gap = 140;
        row.options.forEach((opt, i) => {
            const ox = x + i * gap;
            const active = row.current() === opt.value;
            const btn = this.createButton(canvas, 'Opt_' + opt.label, opt.label, ox, y, 120, 52, () => {
                row.apply(opt.value);
                // 刷新本行高亮
                row.options.forEach((o2, j) => {
                    labels[j].color = o2.value === opt.value ? BTN_ACTIVE : BTN_INACTIVE;
                });
            });
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
        w: number, h: number, onClick?: () => void): Node {
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
        const lut = labNode.addComponent(UITransform);
        lut.setContentSize(w, h);
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
}
