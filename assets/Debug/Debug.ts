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
    EventType,
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
    private spin = true;

    onLoad(): void {
        this.addLights();
        this.buildStaticUI();
        this.setupModelRoot();
    }

    update(dt: number): void {
        if (this.spin && this.currentModel) {
            this.currentModel.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UP, dt * 0.6));
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

    /** 构建静态调试界面 UI（标题 / 状态 / 返回） */
    private buildStaticUI(): void {
        const root = this.node; // Canvas

        this.createLabel(root, 'Title', 'Debug · 模型预览', 0, 320, 40);
        this.createButton(root, 'BtnBack', '← 返回首页', -560, 320, 200, 56, () => this.onBack());
        this.statusLabel = this.createLabel(root, 'Status', '请点击左侧按钮预览飞船模型', 0, 270, 26, new Color(180, 200, 230, 255));

        // 模型列表标题
        this.createLabel(root, 'ListCaption', '飞船模型', -400, 210, 30, new Color(120, 200, 255, 255));
    }

    /** 模型预览根节点：放在画面右侧，位于 UI 平面之后避免深度冲突 */
    private setupModelRoot(): void {
        this.modelRoot = new Node('ModelRoot');
        this.modelRoot.layer = MODEL_LAYER;
        this.modelRoot.setPosition(320, 0, -50);
        this.node.addChild(this.modelRoot);
    }

    /**
     * 点击左侧“标准版”飞船按钮：加载并预览 default_spaceship 模型。
     * 按钮节点已置于 Debug 场景中，点击事件通过编辑器绑定到本方法。
     */
    public onSelectSpaceshipStandard(): void {
        this.loadAndShow('Model/spaceship/default_spaceship', 'Spaceship · 标准版');
    }

    /** 点击左侧“高清版”飞船按钮：加载并预览 default_hq 模型 */
    public onSelectSpaceshipHQ(): void {
        this.loadAndShow('Model/spaceship/default_hq', 'Spaceship · 高清版');
    }

    /** 按资源路径加载飞船 Prefab 并在右侧预览区展示 */
    private loadAndShow(path: string, label: string): void {
        this.setStatus('加载中: ' + label + ' …');
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                // glb 在 Cocos 3.x 中以 cc.Prefab 形式存在于 resources 下，
                // resources.load(path, Prefab) 是正确写法；若仍失败，多半是路径或资源类型不匹配。
                console.error('[Debug] 加载模型失败:', label, 'path =', path, 'err =', err);
                this.setStatus('✘ 加载失败: ' + label + '（' + ((err && err.message) || '资源不存在或类型不匹配') + '）');
                return;
            }
            this.displayModel(prefab as Prefab);
        });
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
        l.fontSize = 26;
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

    /** 显示选中的 3D 模型 */
    private displayModel(prefab: Prefab): void {
        this.clearModel();
        const model = instantiate(prefab);
        // 模型使用 3D 默认层，确保被主相机渲染
        model.layer = MODEL_LAYER;
        model.setPosition(0, 0, 0);
        model.setScale(1, 1, 1);
        this.modelRoot!.addChild(model);
        model.updateWorldTransform(true);
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

    /**
     * 根据模型包围盒自动缩放并居中到 ModelRoot 原点。
     * 注意：getWorldBounds 返回的是“世界坐标”下的包围盒，必须先减去 ModelRoot 的世界坐标，
     * 换算成相对于 ModelRoot 的本地中心后再设置 position，否则模型会被错误地挪到世界原点附近而脱离视野。
     */
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
            // 过滤退化的包围盒（半边长全为 0）
            if (h.x <= 0 && h.y <= 0 && h.z <= 0) continue;
            minX = Math.min(minX, c.x - h.x);
            maxX = Math.max(maxX, c.x + h.x);
            minY = Math.min(minY, c.y - h.y);
            maxY = Math.max(maxY, c.y + h.y);
            minZ = Math.min(minZ, c.z - h.z);
            maxZ = Math.max(maxZ, c.z + h.z);
        }
        if (!isFinite(minX) || (maxX - minX) < 1e-3) {
            // 无网格数据：退回默认姿态，至少保证模型出现在预览区
            model.setScale(1, 1, 1);
            model.setPosition(0, 0, 0);
            return;
        }

        // ModelRoot 的世界坐标与世界缩放（用于把世界包围盒换算回它的本地空间）
        const rootW = this.modelRoot!.worldPosition;
        const rootS = this.modelRoot!.worldScale;
        const cx = ((minX + maxX) / 2 - rootW.x) / rootS.x;
        const cy = ((minY + maxY) / 2 - rootW.y) / rootS.y;
        const cz = ((minZ + maxZ) / 2 - rootW.z) / rootS.z;

        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) /
            Math.max(rootS.x, rootS.y, rootS.z) || 1;
        const scale = TARGET_MODEL_SIZE / maxDim;

        model.setScale(scale, scale, scale);
        model.setPosition(-cx * scale, -cy * scale, -cz * scale);
    }
}
