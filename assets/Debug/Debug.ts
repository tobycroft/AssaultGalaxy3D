import {
    _decorator,
    Component,
    Node,
    director,
    resources,
    Prefab,
    instantiate,
    Vec3,
    Quat,
    Color,
    UITransform,
    Label,
    Graphics,
    Canvas,
    geometry,
    MeshRenderer,
    DirectionalLight,
    EventType,
} from 'cc';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 400;

@ccclass('Debug')
export class Debug extends Component {
    private modelRoot: Node | null = null;
    private currentModel: Node | null = null;
    private modelNameLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private listPanel: Node | null = null;
    private spin = true;

    onLoad(): void {
        this.ensureCameraRendersModel();
        this.addLights();
        this.buildUI();

        this.modelRoot = new Node('ModelRoot');
        this.modelRoot.layer = MODEL_LAYER;
        // 放在 UI 平面之后，避免与 UI 元素发生深度冲突
        this.modelRoot.setPosition(0, 0, -50);
        this.node.addChild(this.modelRoot);
    }

    update(dt: number): void {
        if (this.spin && this.currentModel) {
            this.currentModel.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UP, dt * 0.6));
        }
    }

    /** 确保 UI 相机也能渲染位于 DEFAULT 层的 3D 模型 */
    private ensureCameraRendersModel(): void {
        const canvas = this.getComponent(Canvas);
        if (canvas && canvas.cameraComponent) {
            canvas.cameraComponent.visibility |= MODEL_LAYER;
        }
    }

    /** 添加方向光，保证 3D 模型被正确照亮 */
    private addLights(): void {
        const root = this.node.parent;
        if (!root) return;
        const makeLight = (name: string, ex: number, ey: number, ez: number, ill: number): void => {
            const n = new Node(name);
            const dl = n.addComponent(DirectionalLight);
            dl.illuminance = ill;
            dl.color = new Color(255, 255, 255, 255);
            n.setRotationFromEuler(ex, ey, ez);
            root.addChild(n);
        };
        makeLight('KeyLight', 50, 30, 0, 60000);
        makeLight('FillLight', -30, -120, 0, 25000);
    }

    /** 构建静态调试界面 UI */
    private buildUI(): void {
        const root = this.node; // Canvas

        this.modelNameLabel = this.createLabel(root, 'Title', 'Debug 调试面板', 0, 320, 40);
        this.createButton(root, 'BtnBack', '返回', 560, 330, 140, 56, () => this.onBack());
        this.statusLabel = this.createLabel(root, 'Status', '请选择左侧模型进行预览', 0, 250, 26, new Color(180, 200, 230, 255));

        // 几个按钮，第一个是“模型”
        this.createButton(root, 'BtnModels', '模型', -560, 200, 200, 56, () => this.onShowModels());
        this.createButton(root, 'BtnLevel', '关卡', -560, 120, 200, 56, () => this.setStatus('关卡功能开发中'));
        this.createButton(root, 'BtnAudio', '音效', -560, 40, 200, 56, () => this.setStatus('音效功能开发中'));
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color?: Color,
    ): Label {
        const n = new Node(name);
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(800, fontSize + 12);
        ut.setAnchorPoint(0.5, 0.5);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.lineHeight = fontSize + 12;
        l.color = color ?? new Color(255, 255, 255, 255);
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
        ut.setAnchorPoint(0.5, 0.5);
        const g = btn.addComponent(Graphics);
        this.drawButtonBg(g, w, h, new Color(45, 74, 122, 255));

        const lab = new Node('Label');
        lab.layer = UI_LAYER;
        const lut = lab.addComponent(UITransform);
        lut.setContentSize(w, h);
        const l = lab.addComponent(Label);
        l.string = label;
        l.fontSize = 28;
        l.color = new Color(255, 255, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(lab);

        if (onClick) {
            btn.on(EventType.TOUCH_END, onClick, this);
        }
        parent.addChild(btn);
        return btn;
    }

    private drawButtonBg(g: Graphics, w: number, h: number, color: Color): void {
        g.clear();
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 10);
        g.fill();
    }

    private setStatus(msg: string): void {
        if (this.statusLabel) this.statusLabel.string = msg;
    }

    private onBack(): void {
        director.loadScene('Home');
    }

    /** 点击“模型”按钮：动态列出 resources/Model 下的所有模型 */
    private onShowModels(): void {
        this.setStatus('正在加载模型列表...');
        resources.loadDir('Model', Prefab, (err, assets) => {
            if (err) {
                this.setStatus('加载模型列表失败: ' + err.message);
                return;
            }
            if (!assets || assets.length === 0) {
                this.setStatus('未找到任何模型（请将模型放入 assets/resources/Model 目录）');
                return;
            }
            this.showModelList(assets as Prefab[]);
        });
    }

    /** 展示模型列表弹窗 */
    private showModelList(prefabs: Prefab[]): void {
        this.hideModelList();
        const panel = new Node('ModelListPanel');
        panel.layer = UI_LAYER;
        const put = panel.addComponent(UITransform);
        put.setContentSize(420, 520);
        put.setAnchorPoint(0.5, 0.5);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(10, 14, 28, 240);
        pg.roundRect(-210, -260, 420, 520, 16);
        pg.fill();

        this.createLabel(panel, 'ListTitle', '选择模型', 0, 220, 30);
        this.createButton(panel, 'BtnClose', '关闭', 175, 220, 90, 44, () => this.hideModelList());

        const startY = 160;
        const gap = 64;
        prefabs.forEach((prefab, i) => {
            const y = startY - i * gap;
            const label = prefab.name || 'model_' + i;
            this.createButton(panel, 'Item_' + label, label, 0, y, 360, 52, () => {
                this.displayModel(prefab);
                this.hideModelList();
            });
        });

        this.node.addChild(panel);
        this.listPanel = panel;
        this.setStatus('共找到 ' + prefabs.length + ' 个模型');
    }

    private hideModelList(): void {
        if (this.listPanel) {
            this.listPanel.destroy();
            this.listPanel = null;
        }
    }

    /** 显示选中的 3D 模型 */
    private displayModel(prefab: Prefab): void {
        this.clearModel();
        const model = instantiate(prefab);
        this.modelRoot!.addChild(model);
        // 等一帧让世界矩阵更新后再计算包围盒并自适应缩放
        this.currentModel = model;
        this.spin = false;
        this.scheduleOnce(() => {
            this.fitModel(model);
            this.spin = true;
        }, 0);
        if (this.modelNameLabel) this.modelNameLabel.string = '当前模型: ' + (prefab.name || 'unknown');
        this.setStatus('已加载模型');
    }

    private clearModel(): void {
        if (this.currentModel) {
            this.currentModel.destroy();
            this.currentModel = null;
        }
    }

    /** 根据模型包围盒自动缩放并居中到 ModelRoot 原点 */
    private fitModel(model: Node): void {
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        const aabb = new geometry.AABB();
        const renderers = model.getComponentsInChildren(MeshRenderer);
        for (const r of renderers) {
            if (!r.model) continue;
            r.model.getWorldBounds(aabb);
            const c = aabb.center;
            const h = aabb.halfExtents;
            minX = Math.min(minX, c.x - h.x);
            maxX = Math.max(maxX, c.x + h.x);
            minY = Math.min(minY, c.y - h.y);
            maxY = Math.max(maxY, c.y + h.y);
            minZ = Math.min(minZ, c.z - h.z);
            maxZ = Math.max(maxZ, c.z + h.z);
        }
        if (!isFinite(minX)) return; // 无网格数据

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;
        const maxDim = Math.max(sizeX, sizeY, sizeZ) || 1;
        const scale = TARGET_MODEL_SIZE / maxDim;

        model.setScale(scale, scale, scale);
        model.setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
    }
}
