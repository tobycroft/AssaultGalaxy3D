import {
    _decorator,
    Component,
    Node,
    director,
    resources,
    Prefab,
    instantiate,
    Vec3,
    Vec4,
    Quat,
    Color,
    UITransform,
    Label,
    Graphics,
    geometry,
    MeshRenderer,
    DirectionalLight,
    tween,
} from 'cc';
import { fadeIn, fadeOutThen } from '../Common/UIAnim';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 380;

// 加载界面进度环半径
const LOADING_RING_R = 40;

// 模型分类展示名（key 为 resources/Model 下的一级目录名）
const CATEGORY_NAMES: Record<string, string> = {
    spaceship: '宇宙飞船',
    spacestation: '空间站',
    spaceport: '太空港',
    asteroid: '小行星',
};

@ccclass('Debug')
export class Debug extends Component {
    private modelRoot: Node | null = null;
    private currentModel: Node | null = null;
    private statusLabel: Label | null = null;
    private modelButtonContainer: Node | null = null;
    private spin = true;
    /** 加载界面根节点（模型加载期间展示，完成后销毁） */
    private loadingNode: Node | null = null;
    /** 加载界面进度环（Graphics） */
    private loadingRing: Graphics | null = null;
    /** 加载界面进度文字 */
    private loadingLabel: Label | null = null;

    onLoad(): void {
        this.addLights();
        // 先展示加载界面，再开始异步加载模型，避免进入后长时间空屏
        this.createLoading();
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

        // 列表已按分类展示（各类自带标题），旧的固定标题改为通用文案
        const caption = canvas.getChildByName('ListCaption')?.getComponent(Label);
        if (caption) caption.string = '模型列表';
    }

    /**
     * 创建加载界面：全屏半透明遮罩 + 进度环（底环/进度弧/外圈旋转装饰）+ 进度文字。
     * 模型异步加载期间展示，加载完成后由 hideLoading() 淡出销毁。
     */
    private createLoading(): void {
        const canvas = this.node;
        const layer = canvas.layer;

        const root = new Node('Loading');
        root.layer = layer;
        root.addComponent(UITransform).setContentSize(1280, 720);
        canvas.addChild(root);
        this.loadingNode = root;

        // 半透明深色遮罩：盖住下层 UI，加载期间不可交互
        const mask = new Node('Mask');
        mask.layer = layer;
        mask.addComponent(UITransform).setContentSize(1280, 720);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(8, 14, 26, 220);
        mg.fillRect(-640, -360, 1280, 720);
        root.addChild(mask);

        // 进度环
        const ring = new Node('Ring');
        ring.layer = layer;
        ring.setPosition(0, 50, 0);
        ring.addComponent(UITransform).setContentSize(120, 120);
        this.loadingRing = ring.addComponent(Graphics);
        this.drawLoadingRing(0);
        root.addChild(ring);

        // 外圈旋转装饰弧（两段错位弧线，持续旋转表示“进行中”）
        const spin = new Node('Spin');
        spin.layer = layer;
        const spinUt = spin.addComponent(UITransform);
        spinUt.setContentSize(120, 120);
        const sg = spin.addComponent(Graphics);
        const R = LOADING_RING_R;
        sg.strokeColor = new Color(0, 214, 255, 120);
        sg.lineWidth = 3;
        sg.arc(0, 0, R + 12, 0, Math.PI * 0.55);
        sg.stroke();
        sg.strokeColor = new Color(120, 200, 255, 80);
        sg.arc(0, 0, R + 12, Math.PI, Math.PI * 1.55);
        sg.stroke();
        ring.addChild(spin);
        // 注意：3.x 的 Node 没有 angle 属性，绕 Z 轴旋转须 tween UITransform.angle
        tween(spinUt).by(1.4, { angle: 360 }).repeatForever().start();

        // 进度文字
        const labNode = new Node('Progress');
        labNode.layer = layer;
        labNode.setPosition(0, -45, 0);
        labNode.addComponent(UITransform).setContentSize(600, 40);
        const l = labNode.addComponent(Label);
        l.fontSize = 26;
        l.color = new Color(200, 232, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.string = '正在加载模型…';
        root.addChild(labNode);
        this.loadingLabel = l;
    }

    /** 更新加载进度：重绘进度弧并刷新文字（loaded/total） */
    private updateLoading(loaded: number, total: number): void {
        const p = total > 0 ? loaded / total : 0;
        this.drawLoadingRing(p);
        if (this.loadingLabel) {
            this.loadingLabel.string = `正在加载模型 ${loaded} / ${total}`;
        }
    }

    /** 绘制进度环：灰色底环 + 青色进度弧（12 点方向起笔，顺时针） */
    private drawLoadingRing(progress: number): void {
        const g = this.loadingRing;
        if (!g) return;
        const R = LOADING_RING_R;
        g.clear();
        // 底环
        g.strokeColor = new Color(50, 80, 110, 255);
        g.lineWidth = 6;
        g.arc(0, 0, R, 0, Math.PI * 2, true);
        g.stroke();
        // 进度弧
        const p = Math.max(0, Math.min(1, progress));
        if (p > 0.0001) {
            g.strokeColor = new Color(0, 214, 255, 255);
            g.lineWidth = 6;
            g.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
            g.stroke();
        }
    }

    /** 隐藏加载界面：淡出后销毁，then 回调在销毁后执行（需自行校验组件有效性） */
    private hideLoading(then?: () => void): void {
        const root = this.loadingNode;
        if (!root) {
            then?.();
            return;
        }
        this.loadingNode = null;
        this.loadingRing = null;
        this.loadingLabel = null;
        fadeOutThen(root, 0.25, () => {
            root.destroy();
            then?.();
        });
    }

    /**
     * 添加主平行光并提升环境光，保证 3D 模型被正确照亮。
     * 注意：前向管线每帧只支持 1 盏灯（LIGHTS_PER_PASS = 1），
     * 加多盏平行光/点光不会生效，只有最后添加的平行光作为主光源。
     */
    private addLights(): void {
        const root = this.node.parent;
        if (!root) return;

        // 顶部主光：方向光沿节点 -Z 轴照射，欧拉角 X 必须取负值光才朝下照；
        // -50° 前倾让模型顶部和朝向相机的一面同时被照亮
        const n = new Node('TopLight');
        const dl = n.addComponent(DirectionalLight);
        dl.illuminance = 100000;
        dl.color = new Color(255, 255, 255, 255);
        n.setRotationFromEuler(-50, -25, 0);
        root.addChild(n);

        // 场景环境光：整体补光，每帧从 pipelineSceneData.ambient 读取，运行时修改即时生效
        const ambient = director.root.pipeline.pipelineSceneData.ambient;
        ambient.skyIllum = 60000;
        ambient.groundAlbedo = new Vec4(0.35, 0.35, 0.35, 1);
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
     * 全部加载完成后按一级目录分类、生成带分类标题的按钮列表。
     */
    private loadModels(): void {
        const infos = resources.getDirWithPath('Model', Prefab);
        if (!infos || infos.length === 0) {
            this.hideLoading();
            this.setStatus('未找到任何模型（请将模型放入 assets/resources/Model 目录）');
            return;
        }
        infos.sort((a, b) => a.path.localeCompare(b.path));

        const loaded: { path: string; prefab: Prefab }[] = [];
        const total = infos.length;
        let pending = total;
        infos.forEach((info) => {
            resources.load(info.path, Prefab, (err, prefab) => {
                // 资源异步返回时场景可能已切换（组件已销毁，this.node 为 null），
                // 直接放弃后续处理，避免回调里访问空节点崩溃
                if (!this.isValid) return;
                if (!err && prefab) loaded.push({ path: info.path, prefab });
                pending--;
                this.updateLoading(loaded.length, total);
                if (pending > 0) return;
                if (loaded.length === 0) {
                    this.hideLoading();
                    this.setStatus('模型加载失败');
                    return;
                }
                // 加载完成：先淡出加载界面，再展示模型列表
                this.hideLoading(() => {
                    if (!this.isValid) return;
                    this.showModelButtons(loaded);
                    this.setStatus('共找到 ' + loaded.length + ' 个模型，点击左侧按钮预览');
                });
            });
        });
    }

    /**
     * 在 ModelButtons 容器内按分类分列展示：每个分类占一列（标题在上，按钮竖排），
     * 各列沿画布宽度平均分布、顶部对齐。容器本身可在编辑器里拖动整体移动。
     */
    private showModelButtons(items: { path: string; prefab: Prefab }[]): void {
        if (!this.node) return; // 组件已随场景销毁，不再生成按钮
        const parent = this.modelButtonContainer ?? this.node;

        const groups = new Map<string, { path: string; prefab: Prefab }[]>();
        for (const item of items) {
            const category = item.path.split('/')[1] || 'other';
            const list = groups.get(category) ?? [];
            list.push(item);
            groups.set(category, list);
        }

        const order = Object.keys(CATEGORY_NAMES);
        const categories = [...groups.keys()].sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
        });

        // 列布局：均分画布宽度，列宽 = 画布宽 / 列数，按钮留出列间距
        const canvasW = this.node?.getComponent(UITransform)?.width ?? 960;
        const topY = 200;
        const CAPTION_H = 36;
        const CAPTION_MARGIN = 10;
        const BTN_H = 56;
        const BTN_MARGIN = 6;
        const colW = canvasW / categories.length;
        const btnW = colW - 40;

        let btnIndex = 0;
        categories.forEach((category, i) => {
            const x = -canvasW / 2 + colW * (i + 0.5);
            this.createCategoryLabel(parent, category, x, topY - CAPTION_H / 2);
            let cursor = topY - CAPTION_H - CAPTION_MARGIN;
            for (const item of groups.get(category)!) {
                const label = item.path.split('/').pop() || 'model';
                const btn = this.createButton(parent, 'Btn_' + label, label, x, cursor - BTN_H / 2, btnW, BTN_H, () => {
                    this.displayModel(item.prefab);
                });
                // 错峰淡入：加载完成后按钮逐项亮相
                fadeIn(btn, new Vec3(0, -20, 0), 0.04 * btnIndex);
                btnIndex++;
                cursor -= BTN_H + BTN_MARGIN;
            }
        });
    }

    /** 生成分类标题（如"宇宙飞船"） */
    private createCategoryLabel(parent: Node, category: string, x: number, y: number): void {
        const n = new Node('Caption_' + category);
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(300, 36);
        const l = n.addComponent(Label);
        l.string = CATEGORY_NAMES[category] ?? category;
        l.fontSize = 28;
        l.color = new Color(120, 200, 255, 255);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
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
        l.fontSize = 22;
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
            // 延迟一帧执行，期间场景可能已切换，先校验组件与模型根节点
            if (!this.isValid || !this.modelRoot) return;
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

        // 包围盒中心是世界坐标，必须先换算回 ModelRoot 的本地空间再取反定位，
        // 否则 ModelRoot 不在世界原点时（实际在 960,360,-50），模型会被推出相机视野。
        const localCenter = this.modelRoot!.inverseTransformPoint(new Vec3(), center);
        model.setScale(scale, scale, scale);
        model.setPosition(-localCenter.x * scale, -localCenter.y * scale, -localCenter.z * scale);
    }
}
