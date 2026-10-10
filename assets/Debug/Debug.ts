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

// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 380;

@ccclass('Debug')
export class Debug extends Component {
    private modelRoot: Node | null = null;
    private currentModel: Node | null = null;
    private statusLabel: Label | null = null;
    private spin = true;

    // 启动后由 loadModels() 填充：模型名 -> 预制体
    private models: Record<string, Prefab> = {};

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
     * 绑定场景中已固定摆放的 UI 节点（标题 / 状态 / 返回按钮）。
     * 真正的模型选择按钮 BtnShipStandard / BtnShipHQ 在编辑器里已通过
     * clickEvent 绑定到本脚本的 onSelectSpaceshipStandard / onSelectSpaceshipHQ，
     * 这里只补一个返回按钮的可见圆角背景。
     */
    private bindSceneUI(): void {
        const canvas = this.node;
        this.statusLabel = canvas.getChildByName('StatusLabel')?.getComponent(Label) ?? null;

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

    /** 动态读取 resources/Model 下的所有模型，建立「模型名 -> 预制体」映射 */
    private loadModels(): void {
        resources.loadDir('Model', Prefab, (err, assets) => {
            if (err) {
                this.setStatus('加载模型列表失败: ' + err.message);
                return;
            }
            if (!assets || assets.length === 0) {
                this.setStatus('未找到任何模型（请将模型放入 assets/resources/Model 目录）');
                return;
            }
            assets.forEach((a) => {
                this.models[(a as Prefab).name] = a as Prefab;
            });
            this.setStatus('点击左侧按钮预览模型');
        });
    }

    /** 场景里「Spaceship · 标准版」按钮（BtnShipStandard）的点击事件 */
    private onSelectSpaceshipStandard(): void {
        this.selectModel('default_spaceship');
    }

    /** 场景里「Spaceship · 高清版」按钮（BtnShipHQ）的点击事件 */
    private onSelectSpaceshipHQ(): void {
        this.selectModel('default_hq');
    }

    /** 根据模型名显示对应 3D 模型（优先用已加载的映射，未就绪时兜底按相对路径加载） */
    private selectModel(name: string): void {
        const cached = this.models[name];
        if (cached) {
            this.displayModel(cached);
            return;
        }
        this.setStatus('模型加载中...');
        resources.load('Model/' + name, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.setStatus('加载模型失败: ' + (err ? err.message : name));
                return;
            }
            this.models[name] = prefab;
            this.displayModel(prefab);
        });
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
