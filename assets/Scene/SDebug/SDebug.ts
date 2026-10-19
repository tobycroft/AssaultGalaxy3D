import {
    _decorator,
    Component,
    director,
    Node,
    Vec3,
    Color,
    UITransform,
    Label,
    Graphics,
    Camera,
} from 'cc';
import { fadeOutThen } from '../../Common/UIAnim';
import { paintTechButton, TechText, techTextColor } from '../../Common/TechUI';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 场景调试界面深色背景（相机清屏色）
const BG_COLOR = new Color(10, 18, 32, 255);

/**
 * 可跳转测试的场景列表：新增开场/过场场景后在此登记一项即可。
 * name 为场景名（loadScene 用），label 为按钮展示名。
 */
const SCENE_LIST: { name: string; label: string }[] = [
    { name: '1_opening', label: '1_opening · 深空前线（开场运镜）' },
];

/**
 * 场景调试界面（SDebug = Scene Debug）：从首页 SDebug 按钮进入，
 * 提供各开场/过场场景（Scene 目录）的快捷跳转入口，用于测试镜头动画与场景表现。
 * 区别于 Debug.scene（解体/引擎特效调试）。
 */
@ccclass('SDebug')
export class SDebug extends Component {
    onLoad(): void {
        this.setupCamera();
        this.buildUI();
    }

    /** 深色背景由相机清屏色提供（纯 UI 界面，无 3D 内容，不存在遮挡问题） */
    private setupCamera(): void {
        const cam = this.node.scene?.getChildByName('Camera')?.getComponent(Camera);
        if (cam) cam.clearColor = BG_COLOR;
    }

    private buildUI(): void {
        const canvas = this.node;

        // 标题 / 副标题
        this.createText(canvas, 'Title', '场景调试 · SDEBUG', 0, 280, 44, TechText.bright);
        this.createText(canvas, 'SubTitle', 'SCENE DEBUG · 开场 / 过场场景测试入口', 0, 238, 22, TechText.caption);

        // 场景跳转按钮（居中纵向排列）
        SCENE_LIST.forEach((def, i) => {
            const btn = this.createButton(
                canvas,
                'BtnGo_' + def.name,
                def.label,
                0,
                60 - i * 96,
                560,
                76,
                (): void => this.gotoScene(def.name),
                'primary',
            );
        });

        // 返回首页
        this.createButton(
            canvas,
            'BtnBackHome',
            '返回首页',
            0,
            -290,
            240,
            52,
            (): void => this.gotoScene('Home'),
            'ghost',
        );
    }

    /** 淡出后切换场景（与 Home.switchScene 一致的过渡） */
    private gotoScene(name: string): void {
        // 注意：fadeOutThen 需要给节点加 UIOpacity，场景根（Scene）不允许加组件，
        // 本组件直接挂 Canvas，淡出对象就是 this.node 本身（其子树 UI 一并淡出）
        fadeOutThen(this.node, 0.2, () => director.loadScene(name));
    }

    /** 科技风按钮（背景 + 文字），返回按钮节点 */
    private createButton(
        parent: Node,
        name: string,
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        onClick: () => void,
        kind: 'primary' | 'ghost',
    ): Node {
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
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

        btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }

    /** 居中文本标签 */
    private createText(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color): void {
        const n = new Node(name);
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(900, fontSize + 12);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
    }
}