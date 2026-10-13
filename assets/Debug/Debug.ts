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
    utils,
    AttributeName,
    UIOpacity,
} from 'cc';
import { fadeIn, fadeOutThen } from '../Common/UIAnim';
import { paintTechButton, TechButtonKind, techTextColor, TechText } from '../Common/TechUI';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 380;

// 加载界面进度环半径
const LOADING_RING_R = 40;

// ===== 爆炸 / 碎裂特效参数 =====
/** 单次特效最多生成的碎片数（防模型面数过多时卡顿） */
const FX_MAX_SHARDS = 120;
/** 碎片重力加速度（世界单位/秒²） */
const FX_GRAVITY = 420;
/** 爆裂模式：碎片初速度上限、生命周期（秒） */
const FX_BURST_SPEED = 420;
const FX_BURST_LIFE = 1.0;
/** 碎裂模式：碎片初速度上限、生命周期（秒） */
const FX_SHATTER_SPEED = 130;
const FX_SHATTER_LIFE = 1.8;
/** 中央闪光生命周期（秒） */
const FX_FLASH_LIFE = 0.45;

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
    /** 加载界面外圈旋转装饰节点（隐藏后置空，update 据此停止旋转） */
    private spinNode: Node | null = null;
    /** 装饰弧当前旋转角（度），由 update 逐帧累加 */
    private spinAngle = 0;
    /** 特效模式：burst 爆裂（高速飞溅）/ shatter 碎裂（塌落解体） */
    private fxMode: 'burst' | 'shatter' = 'burst';
    /** 碎片容器节点（挂在 modelRoot 下，特效期间存在） */
    private shardRoot: Node | null = null;
    /** 活动碎片列表（位置/速度由 update 驱动） */
    private shards: { node: Node; vel: Vec3; ang: Vec3; life: number; maxLife: number; baseScale: Vec3 }[] = [];
    /** 爆裂中央闪光（圆环，由 update 驱动放大淡出） */
    private fxFlash: { node: Node; life: number; maxLife: number } | null = null;
    /** 特效是否播放中（播放中禁止再次触发/切换） */
    private fxRunning = false;
    /** 爆裂特效按钮（用于可用态刷新） */
    private fxBurstBtn: Node | null = null;
    /** 碎裂特效按钮（用于可用态刷新） */
    private fxShatterBtn: Node | null = null;

    onLoad(): void {
        this.addLights();
        // 先展示加载界面，再开始异步加载模型，避免进入后长时间空屏
        this.createLoading();
        this.bindSceneUI();
        this.setupModelRoot();
        this.createEffectBar();
        this.loadModels();
    }

    update(dt: number): void {
        // 加载界面装饰弧持续旋转（加载完成/场景切换后 spinNode 置空即停）
        if (this.spinNode) {
            this.spinAngle = (this.spinAngle + dt * 260) % 360;
            this.spinNode.setRotationFromEuler(0, 0, this.spinAngle);
        }
        this.updateFx(dt);
        if (this.spin && this.currentModel && this.currentModel.active) {
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
     * 创建特效按钮条（预览区下方）：爆裂 / 碎裂两个科技风按钮。
     * 未选中模型或特效播放中时置灰（点击由 playFx 拦截）。
     */
    private createEffectBar(): void {
        const bar = new Node('EffectBar');
        bar.layer = UI_LAYER;
        bar.addComponent(UITransform).setContentSize(360, 56);
        bar.setPosition(430, -300, 0);
        this.node.addChild(bar);

        this.fxBurstBtn = this.createFxButton(bar, 'BtnBurst', '爆 裂', -90, 'burst');
        this.fxShatterBtn = this.createFxButton(bar, 'BtnShatter', '碎 裂', 90, 'shatter');
        this.refreshFxButtons();
    }

    /** 创建单个特效按钮（科技风背景 + 文字，返回按钮节点） */
    private createFxButton(parent: Node, name: string, label: string, x: number, mode: 'burst' | 'shatter'): Node {
        const w = 150;
        const h = 52;
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, 0, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, 'danger');

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 26;
        l.color = techTextColor('danger');
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        btn.on(Node.EventType.TOUCH_END, () => this.playFx(mode), this);
        return btn;
    }

    /** 刷新特效按钮可用态：已选中模型且特效未播放时正常，否则置灰 */
    private refreshFxButtons(): void {
        const usable = !!this.currentModel && !this.fxRunning;
        const apply = (btn: Node | null): void => {
            if (!btn) return;
            let o = btn.getComponent(UIOpacity);
            if (!o) o = btn.addComponent(UIOpacity);
            o.opacity = usable ? 255 : 90;
        };
        apply(this.fxBurstBtn);
        apply(this.fxShatterBtn);
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
        spin.addComponent(UITransform).setContentSize(120, 120);
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
        // 旋转由 update(dt) 手动驱动（字段引用），不用 tween：
        // 避免节点销毁后 tween 仍在回调中访问已毁节点导致崩溃
        this.spinNode = spin;

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
            // 节点销毁后必须断引用，否则 update 继续访问已毁节点会崩溃
            this.spinNode = null;
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
        // 切换模型前先复位特效（清理碎片/闪光，恢复模型可见性）
        this.resetFx();
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
        this.refreshFxButtons();
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

    // ================= 爆炸 / 碎裂特效 =================

    /**
     * 播放特效：把当前模型的网格按三角形分组碎裂成独立碎片，
     * 隐藏原模型，碎片按模式（爆裂高速飞溅 / 碎裂塌落解体）运动，
     * 播放完毕后恢复原模型。播放中/未选中模型时忽略点击。
     */
    private playFx(mode: 'burst' | 'shatter'): void {
        if (this.fxRunning) {
            this.setStatus('特效播放中，请稍候…');
            return;
        }
        const model = this.currentModel;
        if (!model || !this.modelRoot) {
            this.setStatus('请先在左侧选择一个模型');
            return;
        }

        this.resetFx();
        this.fxMode = mode;

        // 碎片容器：直接挂 modelRoot（无附加变换），碎片用渲染节点的世界矩阵定位
        const shardRoot = new Node('ShardRoot');
        shardRoot.layer = MODEL_LAYER;
        this.modelRoot.addChild(shardRoot);
        this.shardRoot = shardRoot;

        // 遍历所有 MeshRenderer 提取碎片
        const renderers = model.getComponentsInChildren(MeshRenderer);
        let shardTotal = 0;
        for (const r of renderers) {
            shardTotal += this.extractShards(r, mode, shardRoot, shardTotal);
        }
        if (this.shards.length === 0) {
            shardRoot.destroy();
            this.shardRoot = null;
            this.setStatus('当前模型没有可碎裂的网格数据');
            return;
        }

        // 隐藏原模型，碎片接管展示
        model.active = false;

        // 爆裂模式：中央闪光冲击波
        if (mode === 'burst') this.createFlash();

        this.fxRunning = true;
        this.refreshFxButtons();
        this.setStatus(mode === 'burst'
            ? `爆裂！模型裂成 ${this.shards.length} 块飞溅而出`
            : `碎裂！模型裂成 ${this.shards.length} 块塌落解体`);
    }

    /**
     * 从单个 MeshRenderer 提取三角形碎片：读取网格顶点/索引，按每组 2~3 个三角形
     * （总量受 FX_MAX_SHARDS 限制）拆成多个小 Mesh，各自挂节点用渲染节点世界矩阵定位，
     * 并按模式赋予初速度与角速度。返回本次生成的碎片数。
     */
    private extractShards(renderer: MeshRenderer, mode: 'burst' | 'shatter', shardRoot: Node, madeBefore: number): number {
        const mesh = renderer.mesh;
        if (!mesh) return 0;
        const mat = renderer.getMaterialInstance(0) ?? renderer.material;
        const subCount = mesh.renderingSubMeshes.length;
        let made = 0;

        for (let s = 0; s < subCount; s++) {
            const positions = mesh.readAttribute(s, AttributeName.ATTR_POSITION) as Float32Array | null;
            const normals = mesh.readAttribute(s, AttributeName.ATTR_NORMAL) as Float32Array | null;
            const uvs = mesh.readAttribute(s, AttributeName.ATTR_TEX_COORD) as Float32Array | null;
            const indices = mesh.readIndices(s);
            if (!positions || !indices) continue;

            const triCount = Math.floor(indices.length / 3);
            if (triCount <= 0) continue;

            // 分组大小：总量不超过 FX_MAX_SHARDS（含之前渲染器已生成的）
            const remain = FX_MAX_SHARDS - (madeBefore + made);
            if (remain <= 0) break;
            const perGroup = Math.max(1, Math.ceil(triCount / remain));

            // 三角形顺序确定性打乱，让相邻面随机落入不同碎片
            const order: number[] = [];
            for (let t = 0; t < triCount; t++) order.push(t);
            for (let t = triCount - 1; t > 0; t--) {
                const j = (t * 7919 + s * 104729 + made * 31) % (t + 1);
                const tmp = order[t];
                order[t] = order[j];
                order[j] = tmp;
            }

            for (let start = 0; start < triCount; start += perGroup) {
                if (madeBefore + made >= FX_MAX_SHARDS) break;
                const tris = order.slice(start, Math.min(start + perGroup, triCount));
                if (tris.length === 0) continue;

                // 收集该组三角形用到的顶点（去重），记录新索引
                const vMap = new Map<number, number>();
                const newPos: number[] = [];
                const newNor: number[] = [];
                const newUv: number[] = [];
                const newIdx: number[] = [];
                for (const t of tris) {
                    for (let k = 0; k < 3; k++) {
                        const src = indices[t * 3 + k];
                        let dst = vMap.get(src);
                        if (dst === undefined) {
                            dst = newPos.length / 3;
                            vMap.set(src, dst);
                            newPos.push(positions[src * 3], positions[src * 3 + 1], positions[src * 3 + 2]);
                            if (normals) newNor.push(normals[src * 3], normals[src * 3 + 1], normals[src * 3 + 2]);
                            if (uvs) newUv.push(uvs[src * 2], uvs[src * 2 + 1]);
                        }
                        newIdx.push(dst);
                    }
                }

                // 碎片局部中心不再单独计算：方向基准直接用碎片节点本地坐标（见下）

                const m = utils.createMesh({
                    positions: newPos,
                    normals: newNor.length > 0 ? newNor : undefined,
                    uvs: newUv.length > 0 ? newUv : undefined,
                    indices: new Uint16Array(newIdx),
                });
                const n = new Node('Shard');
                n.layer = MODEL_LAYER;
                // 必须先入树再设世界矩阵（setter 会按父变换换算成本地矩阵），
                // 顶点是渲染节点局部坐标，复制其世界矩阵即可原位呈现
                shardRoot.addChild(n);
                n.matrix = renderer.node.worldMatrix;
                // 记录初始缩放（世界矩阵换算而来），尾部缩放在此基础上叠加
                const baseScale = new Vec3(n.scale.x, n.scale.y, n.scale.z);
                const mr = n.addComponent(MeshRenderer);
                mr.mesh = m;
                if (mat) mr.material = mat;

                // 方向：碎片本地坐标相对 modelRoot 原点（shardRoot 无附加变换，本地即模型空间）
                const dir = new Vec3(n.position.x, n.position.y, n.position.z);
                if (dir.lengthSqr() < 1e-4) dir.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5);
                dir.normalize();

                // 初速度与角速度
                const vel = new Vec3();
                const ang = new Vec3();
                const maxLife = mode === 'burst' ? FX_BURST_LIFE : FX_SHATTER_LIFE;
                if (mode === 'burst') {
                    // 爆裂：高速飞溅 + 上扬 + 大随机扰动
                    const speed = FX_BURST_SPEED * (0.55 + Math.random() * 0.75);
                    vel.set(dir.x * speed, dir.y * speed * 0.7 + 160 * Math.random(), dir.z * speed);
                    vel.x += (Math.random() - 0.5) * 160;
                    vel.z += (Math.random() - 0.5) * 160;
                    ang.set((Math.random() - 0.5) * 720, (Math.random() - 0.5) * 720, (Math.random() - 0.5) * 720);
                } else {
                    // 碎裂：低速塌落 + 打滚
                    const speed = FX_SHATTER_SPEED * (0.4 + Math.random() * 0.8);
                    vel.set(dir.x * speed + (Math.random() - 0.5) * 60, dir.y * speed * 0.5 + 40, dir.z * speed + (Math.random() - 0.5) * 60);
                    ang.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260);
                }
                this.shards.push({ node: n, vel, ang, life: 0, maxLife, baseScale });
                made++;
            }
        }
        return made;
    }

    /** 爆裂中央闪光：圆环快速放大并淡出（update 驱动） */
    private createFlash(): void {
        const root = this.modelRoot;
        if (!root) return;
        const n = new Node('FxFlash');
        n.layer = MODEL_LAYER;
        // 定位到 modelRoot 原点（fitModel 已将模型几何中心置于此处）
        n.setPosition(0, 0, 0);
        n.addComponent(UITransform).setContentSize(10, 10);
        const g = n.addComponent(Graphics);
        root.addChild(n);
        this.fxFlash = { node: n, life: 0, maxLife: FX_FLASH_LIFE };
        // 立即画一帧（后续由 updateFx 重绘放大淡出）
        this.drawFlash(g, 0);
    }

    /** 绘制闪光圆环：t∈[0,1] 由小变大、由亮变暗 */
    private drawFlash(g: Graphics, t: number): void {
        const r = 20 + t * 260;
        g.clear();
        g.fillColor = new Color(255, 240, 200, Math.round(230 * (1 - t)));
        g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        g.fill();
        g.strokeColor = new Color(255, 220, 150, Math.round(255 * (1 - t)));
        g.lineWidth = Math.max(1, 8 * (1 - t));
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
    }

    /** 特效逐帧驱动：碎片运动 + 尾部缩小 + 闪光扩散 + 结束恢复 */
    private updateFx(dt: number): void {
        // 闪光扩散（即使碎片已全部消亡也要走完）
        if (this.fxFlash) {
            const f = this.fxFlash;
            f.life += dt;
            const t = f.life / f.maxLife;
            if (t >= 1) {
                f.node.destroy();
                this.fxFlash = null;
            } else {
                this.drawFlash(f.node.getComponent(Graphics)!, t);
            }
        }

        if (!this.fxRunning) return;
        for (const sh of this.shards) {
            sh.life += dt;
            if (sh.life >= sh.maxLife) {
                sh.node.destroy();
                continue;
            }
            // 重力 + 位移（shardRoot 无附加变换，本地速度即世界速度）
            sh.vel.y -= FX_GRAVITY * dt;
            const p = sh.node.position;
            sh.node.setPosition(p.x + sh.vel.x * dt, p.y + sh.vel.y * dt, p.z + sh.vel.z * dt);
            const e = sh.node.eulerAngles;
            sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
            // 尾部 30% 生命周期开始缩小消失（在初始缩放基础上叠加）
            const k = sh.life / sh.maxLife;
            if (k > 0.7) {
                const s = 1 - (k - 0.7) / 0.3;
                sh.node.setScale(sh.baseScale.x * s, sh.baseScale.y * s, sh.baseScale.z * s);
            }
        }
        this.shards = this.shards.filter((sh) => sh.life < sh.maxLife);

        if (this.shards.length === 0 && !this.fxFlash) {
            this.finishFx();
        }
    }

    /** 特效自然结束：恢复原模型可见，清理容器 */
    private finishFx(): void {
        this.fxRunning = false;
        if (this.shardRoot) {
            this.shardRoot.destroy();
            this.shardRoot = null;
        }
        this.shards = [];
        if (this.currentModel) this.currentModel.active = true;
        this.refreshFxButtons();
        this.setStatus('特效播放完毕，可再次点击或切换模型');
    }

    /** 立即复位特效（切换模型/退出场景前调用）：清理碎片与闪光，恢复模型可见 */
    private resetFx(): void {
        this.fxRunning = false;
        for (const sh of this.shards) sh.node.destroy();
        this.shards = [];
        if (this.shardRoot) {
            this.shardRoot.destroy();
            this.shardRoot = null;
        }
        if (this.fxFlash) {
            this.fxFlash.node.destroy();
            this.fxFlash = null;
        }
        if (this.currentModel) this.currentModel.active = true;
        this.refreshFxButtons();
    }
}
