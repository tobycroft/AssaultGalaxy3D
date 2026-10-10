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
    geometry,
    MeshRenderer,
    DirectionalLight,
} from 'cc';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 380;

@ccclass('Debug')
export class Debug extends Component {
    private modelRoot: Node | null = null;
    private currentModel: Node | null = null;
    private statusLabel: Label | null = null;
    private modelButtonContainer: Node | null = null;
    private spin = true;

    onLoad(): void {
        this.addLights();
        this.bindSceneUI();
        this.setupModelRoot();
        this.loadModels();
    }

    update(dt: number): void {
        if (this.spin && this.currentModel) {
            this.currentModel.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UP, dt * 0.6));
        }
    }

    /**
     * 绑定场景中已固定摆放的 UI 节点（标题 / 状态 / 返回按钮 / 模型列表容器）。
     * 模型列表按钮由 loadModels() 动态生成、统一挂在 ModelButtons 容器内。
     */
    private bindSceneUI(): void {
        const canvas = this.node;
        this.statusLabel = canvas.getChildByName('StatusLabel')?.getComponent(Label) ?? null;
        this.modelButtonContainer = canvas.getChildByName('ModelButtons') ?? null;

        // 给返回按钮补一个可见的圆角背景（节点本身在场景中固定，可拖动）
        const back = canvas.getChildByName('BackButton');
        if (back) {
            const g = back.getComponent(Graphics) ?? back.addComponent(Graphics);
            this.drawButtonBg(g, 200, 56, new Color(45, 74, 122, 255));
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
        // 顶灯：从正上方垂直往下照，突出模型顶部
        makeLight('TopLight', 90, 0, 0, 40000);
    }

    /** 模型预览根节点：放在画面右侧，位于 UI 平面之后避免深度冲突 */
    private setupModelRoot(): void {
        this.modelRoot = new Node('ModelRoot');
        this.modelRoot.layer = MODEL_LAYER;
        this.modelRoot.setPosition(320, 0, -50);
        this.node.addChild(this.modelRoot);
    }

    /**
     * 统一的模型列表：自动列举 resources/Model 下所有模型，
     * 全部加载完成后按路径排序一次性生成按钮（统一样式、统一位置）。
     * 按钮标签取模型文件名（如 default_spaceship / station1_tiangong）。
     */
    private loadModels(): void {
        const infos = resources.getDirWithPath('Model', Prefab);
        if (!infos || infos.length === 0) {
            this.setStatus('未找到任何模型（请将模型放入 assets/resources/Model 目录）');
            return;
        }
        infos.sort((a, b) => a.path.localeCompare(b.path));

        const prefabs: (Prefab | null)[] = new Array(infos.length).fill(null);
        let pending = infos.length;
        infos.forEach((info, i) => {
            resources.load(info.path, Prefab, (err, prefab) => {
                prefabs[i] = err ? null : prefab;
                pending--;
                if (pending > 0) return;
                const list = prefabs.filter((p): p is Prefab => !!p);
                if (list.length === 0) {
                    this.setStatus('模型加载失败');
                    return;
                }
                this.showModelButtons(infos, list);
                this.setStatus('共找到 ' + list.length + ' 个模型，点击左侧按钮预览');
            });
        });
    }

    /**
     * 在固定的 ModelButtons 容器内，为每个模型生成统一样式的按钮。
     * 容器本身可在编辑器里拖动，从而整体移动模型列表。
     */
    private showModelButtons(infos: { path: string }[], prefabs: Prefab[]): void {
        const parent = this.modelButtonContainer ?? this.node;
        const startY = 150;
        const gap = 74;
        prefabs.forEach((prefab, i) => {
            const y = startY - i * gap;
            const label = infos[i].path.split('/').pop() || 'model_' + i;
            this.createButton(parent, 'Btn_' + label, label, -400, y, 300, 60, () => {
                this.displayModel(prefab);
            });
        });
    }

    /** 运行时动态生成单个模型按钮（挂在固定的 ModelButtons 容器内） */
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
        l.fontSize = 26;
        l.color = new Color(255, 255, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(lab);

        if (onClick) {
            // cc 没有顶层 EventType 导出，触摸事件必须用 Node.EventType
            btn.on(Node.EventType.TOUCH_END, onClick, this);
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

    /** 返回首页（已在场景中通过 Button 点击事件绑定） */
    private onBack(): void {
        director.loadScene('Home');
    }

    /** 显示选中的 3D 模型 */
    private displayModel(prefab: Prefab): void {
        this.clearModel();
        const model = instantiate(prefab);
        this.modelRoot!.addChild(model);
        this.currentModel = model;
        this.spin = false;
        this.scheduleOnce(() => {
            this.fitModel(model);
            this.spin = true;
        }, 0);
        this.setStatus('已加载模型: ' + (prefab.name || 'unknown'));
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
            const m = r.model;
            // 3.8 的渲染 Model 没有 getWorldBounds()，只有 modelBounds（局部空间）属性；
            // worldBounds 要等渲染管线更新一帧后才有值，这里用节点世界矩阵把 modelBounds
            // 变换到世界空间（与引擎 Model.updateTransform 的算法一致，且不依赖帧时序）。
            if (!m || !m.modelBounds) continue;
            geometry.AABB.transform(aabb, m.modelBounds, r.node.worldMatrix);
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
