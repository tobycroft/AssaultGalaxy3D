import {
    _decorator,
    BlockInputEvents,
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
    Mesh,
    MeshRenderer,
    DirectionalLight,
    utils,
    UIOpacity,
    Mat4,
    MotionStreak,
    SpotLight,
    SphereLight,
    assetManager,
    Texture2D,
    ParticleSystem2D,
    Vec2,
    Camera,
    SpriteFrame,
    Rect,
    Material,
    tween,
} from 'cc';
import { fadeIn, fadeOutThen } from '../Common/UIAnim';
import { paintTechButton, TechButtonKind, techTextColor, TechText } from '../Common/TechUI';
import { allShardCaps, FX_MAX_SHARDS, FX_SHATTER_CAPS, ShardBlob, ShardEntry, ShardStore } from '../Common/ShardStore';
import { extractShards, modelFingerprint, readSubMeshes, resolveNodePath, SrcSubMesh } from '../Common/ShardCutter';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;

// 预览时模型统一缩放到的大致尺寸（世界单位）
const TARGET_MODEL_SIZE = 380;

// 加载界面双进度条：槽宽 / 槽高 / 旋转装饰弧半径
const LOADING_BAR_W = 560;
const LOADING_BAR_H = 16;
const LOADING_SPIN_R = 52;

// ===== 解体特效参数 =====
/** 解体模式：爆裂/碎裂(10/60/120 三档)/汽化/黑洞/旋风/切割/熔陷 */
type FxMode = 'burst' | 'shatter10' | 'shatter60' | 'shatter120' | 'vaporize' | 'blackhole' | 'whirlwind' | 'slice' | 'sink';
// 碎片档位常量（FX_SHATTER_CAPS / FX_MAX_SHARDS / allShardCaps）与切割算法
// （extractShards / readSubMeshes / modelFingerprint / resolveNodePath）已移至
// Common/ShardStore 与 Common/ShardCutter，供 Debug 与 Intro 开机预热共用
/**
 * 碎片模板（播放期形态）：碎片网格 + 来源渲染节点 + 材质。
 * 由 ShardStore 缓存条目（ShardEntry）按当前模型实例绑定生成：网格顶点在渲染节点
 * 局部空间，播放时按来源节点当前世界矩阵实时换算放置（模型会自旋，矩阵不能缓存），
 * 从而同一模型重复播放（含重进场景）不再重新切网格与上传显存。
 */
interface ShardTemplate {
    mesh: Mesh;
    material: Material | null;
    srcNode: Node;
}

/** 活动碎片运行时状态：节点 + 速度/角速度/生命期（位置与旋转由 update 驱动） */
interface ShardRuntime {
    node: Node;
    vel: Vec3;
    ang: Vec3;
    life: number;
    maxLife: number;
    baseScale: Vec3;
}

/** 碎片重力加速度（世界单位/秒²）：仅切割模式使用；爆裂/碎裂三档为太空无重力匀速四散，熔陷用 FX_SINK_GRAVITY */
const FX_GRAVITY = 420;
/** 爆裂模式：碎片初速度上限、生命周期（秒） */
const FX_BURST_SPEED = 420;
const FX_BURST_LIFE = 1.0;
/** 碎裂模式：碎片初速度上限、生命周期（秒） */
const FX_SHATTER_SPEED = 130;
const FX_SHATTER_LIFE = 1.8;
/** 汽化模式：生命周期（秒），碎片原地缩放溶解 */
const FX_VAPORIZE_LIFE = 0.7;
/** 黑洞模式：生命周期（秒）、向心加速度、速度上限 */
const FX_BLACKHOLE_LIFE = 1.2;
const FX_BLACKHOLE_G = 900;
const FX_BLACKHOLE_MAX_SPEED = 620;
/** 旋风模式：生命周期（秒）、绕轴角速度（rad/s）、上升速度、径向扩散（比例/秒） */
const FX_WHIRLWIND_LIFE = 1.6;
const FX_WHIRLWIND_OMEGA = 2.4;
const FX_WHIRLWIND_UP = 260;
const FX_WHIRLWIND_SPREAD = 0.5;
/** 切割模式：两半分离速度、生命周期（秒） */
const FX_SLICE_SPEED = 170;
const FX_SLICE_LIFE = 1.0;
/** 熔陷模式：下沉重力、生命周期（秒）、modelRoot 本地下沉底 */
const FX_SINK_GRAVITY = 700;
const FX_SINK_LIFE = 1.5;
const FX_SINK_FLOOR = -330;
/** 中央闪光生命周期（秒） */
const FX_FLASH_LIFE = 0.45;
/** 特效按钮栏：一排等宽按钮 */
const FX_BTN_W = 116;
const FX_BTN_H = 48;
const FX_BTN_GAP = 10;
/** 特效按钮定义（名称/文案/模式） */
const FX_BUTTONS: { name: string; label: string; mode: FxMode }[] = [
    { name: 'BtnBurst', label: '爆裂', mode: 'burst' },
    { name: 'BtnShatter10', label: '碎裂×10', mode: 'shatter10' },
    { name: 'BtnShatter60', label: '碎裂×60', mode: 'shatter60' },
    { name: 'BtnShatter120', label: '碎裂×120', mode: 'shatter120' },
    { name: 'BtnVaporize', label: '汽化', mode: 'vaporize' },
    { name: 'BtnBlackhole', label: '黑洞', mode: 'blackhole' },
    { name: 'BtnWhirlwind', label: '旋风', mode: 'whirlwind' },
    { name: 'BtnSlice', label: '切割', mode: 'slice' },
    { name: 'BtnSink', label: '熔陷', mode: 'sink' },
];
/**
 * 完成度定格按钮：播放当前解体特效并把动画直接推进到指定完成度并冻结
 * （调试用：查看碎裂炸到 50%/80%/100% 时的形态，碎片停住不继续运动）。
 */
const FX_PROGRESS_BUTTONS: { name: string; label: string; k: number }[] = [
    { name: 'BtnProg50', label: '碎裂50%', k: 0.5 },
    { name: 'BtnProg80', label: '碎裂80%', k: 0.8 },
    { name: 'BtnProg100', label: '碎裂100%', k: 1 },
];
/** 各模式状态栏文案：名称 + 解体动作描述 */
const FX_LABELS: Record<FxMode, string> = {
    burst: '爆裂',
    shatter10: '碎裂×10',
    shatter60: '碎裂×60',
    shatter120: '碎裂×120',
    vaporize: '汽化',
    blackhole: '黑洞',
    whirlwind: '旋风',
    slice: '切割',
    sink: '熔陷',
};
const FX_VERBS: Record<FxMode, string> = {
    burst: '飞溅而出',
    shatter10: '四散解体',
    shatter60: '四散解体',
    shatter120: '四散解体',
    vaporize: '蒸发消失',
    blackhole: '被吸入湮灭',
    whirlwind: '螺旋卷走',
    slice: '沿平面分离',
    sink: '塌陷沉没',
};

// ===== 引擎特效演示参数 =====
/** 引擎特效演示类型（底部第二排按钮，点击后在预览区播放） */
type EngineFxKind = 'easing' | 'trail' | 'spotlight' | 'pulse' | 'shockwave' | 'particle' | 'shadow' | 'shake';
/** 引擎特效演示按钮定义 */
const ENGINE_FX_BUTTONS: { name: string; label: string; kind: EngineFxKind }[] = [
    { name: 'BtnFxEasing', label: '缓动', kind: 'easing' },
    { name: 'BtnFxTrail', label: '拖尾', kind: 'trail' },
    { name: 'BtnFxSpotlight', label: '探照灯', kind: 'spotlight' },
    { name: 'BtnFxPulse', label: '脉冲光', kind: 'pulse' },
    { name: 'BtnFxShockwave', label: '冲击波', kind: 'shockwave' },
    { name: 'BtnFxParticle', label: '粒子', kind: 'particle' },
    { name: 'BtnFxShadow', label: '阴影', kind: 'shadow' },
    { name: 'BtnFxShake', label: '震屏', kind: 'shake' },
];
/** 引擎特效状态文案（体现引擎实现方式） */
const ENGINE_FX_LABELS: Record<EngineFxKind, string> = {
    easing: 'Tween 缓动赛道',
    trail: 'MotionStreak 拖尾',
    spotlight: 'SpotLight 探照灯',
    pulse: 'SphereLight 脉冲光',
    shockwave: 'Graphics 冲击波',
    particle: 'ParticleSystem 2D 粒子',
    shadow: 'DirectionalLight 实时阴影',
    shake: 'Camera 相机震屏',
};
/** 缓动赛道演示的 tween 缓动函数列表（引擎内置 easing） */
const FX_EASING_LIST: { label: string; easing: string }[] = [
    { label: 'sineIn', easing: 'sineIn' },
    { label: 'quadOut', easing: 'quadOut' },
    { label: 'cubicOut', easing: 'cubicOut' },
    { label: 'backOut', easing: 'backOut' },
    { label: 'elasticOut', easing: 'elasticOut' },
    { label: 'bounceOut', easing: 'bounceOut' },
];
/** 引擎特效各模式播放时长（秒） */
const ENGINE_FX_DURATION: Record<EngineFxKind, number> = {
    easing: 2.4,
    trail: 3.2,
    spotlight: 3.6,
    pulse: 3.2,
    shockwave: 1.2,
    particle: 2.6,
    shadow: 3.6,
    shake: 1.2,
};
/** 探照灯/脉冲光的亮度（前向管线每帧仅 1 盏灯生效，播放期间需隐藏主光；实测 luminousFlux 换算后过暗，直接设 luminance） */
const LIGHT_LUMINANCE = 400000;

// 模型分类展示名（key 为 resources/Model 下的一级目录名）
const CATEGORY_NAMES: Record<string, string> = {
    spaceship: '宇宙飞船',
    spacestation: '空间站',
    spaceport: '太空港',
    asteroid: '小行星',
};

/**
 * Debug 调试场景控制器：模型预览 + 解体特效 + 引擎特效演示。
 * 进入流程：双进度条读条（模型加载 / 效果预缓存）→ 默认加载第一个模型并
 * 预缓存其全部档位的碎片模板 → 用户点击左侧按钮切换模型、点击底部按钮播放特效。
 * 解体特效把模型网格按三角形分组切成独立碎片运动（详见 extractShards / spawnShards），
 * 碎片模板按 prefab uuid+档位 缓存于 ShardStore（模块级单例）：同一会话内重进场景
 * 直接用内存缓存，native 上重启后读磁盘缓存重建，首次播放零卡顿。
 */
@ccclass('Debug')
export class Debug extends Component {
    private modelRoot: Node | null = null;
    private currentModel: Node | null = null;
    private statusLabel: Label | null = null;
    private modelButtonContainer: Node | null = null;
    private spin = true;
    /** 加载界面根节点（模型加载期间展示，完成后销毁） */
    private loadingNode: Node | null = null;
    /** 加载界面标题文字 */
    private loadingLabel: Label | null = null;
    /** 模型加载进度条填充（Graphics，重绘宽度表示进度） */
    private loadingModelBar: Graphics | null = null;
    /** 模型加载百分比文字 */
    private loadingModelPct: Label | null = null;
    /** 效果预缓存进度条填充（Graphics） */
    private loadingFxBar: Graphics | null = null;
    /** 效果预缓存百分比文字 */
    private loadingFxPct: Label | null = null;
    /**
     * 读条期预缓存任务：待缓存档位队列，由 update 每帧处理一档（precacheTick）。
     * 不用 scheduleOnce 让回调自调度：同一回调重复调度时引擎只告警、不新建定时器
     * （scheduler.ts logID 1507），且一次性定时器在回调执行后即自取消，链会断。
     * subs：全部渲染器的子网格属性缓存，首次切割时读一次、后续档位复用（读一次切三档），
     * 三档处理完置 null 释放（大模型的属性全量拷贝占用可观）。
     */
    private precacheJob: {
        prefabUuid: string;
        model: Node;
        caps: number[];
        total: number;
        /** 当前模型的几何指纹：磁盘缓存失效校验用（模型重新导入后 uuid 不变但几何可能已变） */
        fingerprint: number[];
        /** 渲染器 → 子网格属性缓存；null 表示尚未读取 */
        subs: Map<MeshRenderer, (SrcSubMesh | null)[]> | null;
        onDone: () => void;
    } | null = null;
    /** 加载界面外圈旋转装饰节点（隐藏后置空，update 据此停止旋转） */
    private spinNode: Node | null = null;
    /** 装饰弧当前旋转角（度），由 update 逐帧累加 */
    private spinAngle = 0;
    /** 当前特效模式（7 种解体方式之一） */
    private fxMode: FxMode = 'burst';
    /** 碎片容器节点（挂在 modelRoot 下，特效期间存在） */
    private shardRoot: Node | null = null;
    /** 活动碎片列表（位置/速度由 update 驱动） */
    private shards: ShardRuntime[] = [];
    /**
     * 特效冻结中（完成度定格）：true 时 updateFx 跳过碎片推进，画面停在该完成度，
     * 模型保持隐藏、碎片保持散开状态；点击其他特效按钮或切换模型时经 resetFx 解除。
     */
    private fxFrozen = false;
    /**
     * 当前模型的 prefab 资源 uuid：碎片缓存 key 用它而非实例 node.uuid——
     * 模型每次进场景都是 instantiate 出来的新实例，实例 uuid 每次都变、跨场景必 miss。
     * 碎片模板本体在 ShardStore（模块级单例，跨场景存活），此处只记录当前模型的 key 前缀。
     */
    private currentPrefabUuid = '';
    /** 爆裂/切割中央闪光（圆环，由 update 驱动放大淡出） */
    private fxFlash: { node: Node; life: number; maxLife: number } | null = null;
    /** 特效是否播放中（播放中禁止再次触发/切换） */
    private fxRunning = false;
    /** 全部特效按钮（解体 + 引擎特效演示，用于可用态统一刷新） */
    private fxButtons: Node[] = [];
    /** 当前引擎特效演示类型（与解体特效互斥，共用 fxRunning） */
    private engineFx: EngineFxKind | null = null;
    /** 引擎特效节点列表（结束统一清理） */
    private fxNodes: Node[] = [];
    /** 引擎特效计时器（秒） */
    private fxTimer = 0;
    /** 拖尾飞球当前角度（update 驱动） */
    private trailAngle = 0;
    /** 探照灯/脉冲光播放期间被隐藏的主光节点（结束恢复） */
    private hiddenTopLight: Node | null = null;
    /** 冲击波圆环列表（update 驱动扩散） */
    private shockRings: { g: Graphics; life: number; delay: number }[] = [];
    /** 阴影演示用的地面（接收实时阴影），结束销毁 */
    private shadowGround: Node | null = null;
    /** 阴影演示期间因 castShadow 被改的模型渲染器，结束恢复 */
    private shadowCasters: MeshRenderer[] = [];
    /** 震屏相机引用 */
    private shakeCamera: Camera | null = null;
    /** 震屏相机初始位置（结束恢复） */
    private shakeOrigin: Vec3 | null = null;

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
        // 读条期预缓存：每帧切一档碎片模板并重绘进度条，切完自动收起加载界面
        if (this.precacheJob) this.precacheTick();
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

        // 返回按钮背景由场景中 BackButton 节点自带的 Sprite 提供（颜色 45,74,122），
        // 不再运行时 addComponent(Graphics)：一个节点只能有一个渲染组件，
        // 补画会触发 "Can't add renderable component" 告警且该 Graphics 不会渲染

        // 列表已按分类展示（各类自带标题），旧的固定标题改为通用文案
        const caption = canvas.getChildByName('ListCaption')?.getComponent(Label);
        if (caption) caption.string = '模型列表';
    }

    /**
     * 创建特效按钮条（预览区下方）：爆裂 / 碎裂两个科技风按钮。
     * 未选中模型或特效播放中时置灰（点击由 playFx 拦截）。
     */
    /**
     * 创建特效按钮栏（预览区下方三排）：
     * 第一排解体特效，第二排引擎特效演示，第三排碎裂完成度定格，均为等宽按钮。
     */
    private createEffectBar(): void {
        const n = FX_BUTTONS.length;
        const m = ENGINE_FX_BUTTONS.length;
        const p = FX_PROGRESS_BUTTONS.length;
        // 每排按自身按钮数居中布局，容器取三排较宽者
        const w1 = n * FX_BTN_W + (n - 1) * FX_BTN_GAP;
        const w2 = m * FX_BTN_W + (m - 1) * FX_BTN_GAP;
        const w3 = p * FX_BTN_W + (p - 1) * FX_BTN_GAP;
        const totalW = Math.max(w1, w2, w3);
        const bar = new Node('EffectBar');
        bar.layer = UI_LAYER;
        bar.addComponent(UITransform).setContentSize(totalW, FX_BTN_H * 3 + 20);
        // 三排后容器变高，位置上移保证底边不出画布（半高 360）
        bar.setPosition(0, -278, 0);
        this.node.addChild(bar);

        // 第一排：解体特效
        FX_BUTTONS.forEach((def, i) => {
            const x = -w1 / 2 + FX_BTN_W / 2 + i * (FX_BTN_W + FX_BTN_GAP);
            this.fxButtons.push(this.createFxButton(bar, def.name, def.label, x, FX_BTN_H / 2 + 5, () => this.playFx(def.mode)));
        });
        // 第二排：引擎特效演示（各按自身宽度居中均布）
        ENGINE_FX_BUTTONS.forEach((def, i) => {
            const x = -w2 / 2 + FX_BTN_W / 2 + i * (FX_BTN_W + FX_BTN_GAP);
            this.fxButtons.push(this.createFxButton(bar, def.name, def.label, x, -FX_BTN_H / 2 - 5, () => this.playEngineFx(def.kind)));
        });
        // 第三排：碎裂完成度定格（播放当前解体特效并冻结在指定完成度）
        FX_PROGRESS_BUTTONS.forEach((def, i) => {
            const x = -w3 / 2 + FX_BTN_W / 2 + i * (FX_BTN_W + FX_BTN_GAP);
            this.fxButtons.push(this.createFxButton(bar, def.name, def.label, x, -FX_BTN_H * 1.5 - 15, () => this.freezeProgress(def.k)));
        });
        this.refreshFxButtons();
    }

    /** 创建单个特效按钮（科技风背景 + 文字，返回按钮节点） */
    private createFxButton(parent: Node, name: string, label: string, x: number, y: number, onClick: () => void): Node {
        const w = FX_BTN_W;
        const h = FX_BTN_H;
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, 'danger');

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = techTextColor('danger');
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
        return btn;
    }

    /** 刷新特效按钮可用态：已选中模型且特效未播放（或冻结定格中，可点击解除）时正常，否则置灰 */
    private refreshFxButtons(): void {
        const usable = !!this.currentModel && (!this.fxRunning || this.fxFrozen);
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
     * 创建加载界面：全屏半透明遮罩 + 旋转装饰 + 标题 + 双进度条
     * （模型加载 / 效果预缓存）。模型异步加载与碎片模板预缓存期间展示，
     * 全部完成后由 hideLoading() 淡出销毁。
     */
    private createLoading(): void {
        const canvas = this.node;
        const layer = canvas.layer;

        const root = new Node('Loading');
        root.layer = layer;
        root.addComponent(UITransform).setContentSize(1280, 720);
        // 拦截加载/预缓存期间的所有触摸，避免误触特效按钮与预缓存流程抢跑
        root.addComponent(BlockInputEvents);
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

        // 标题
        const titleNode = new Node('Title');
        titleNode.layer = layer;
        titleNode.setPosition(0, 108, 0);
        titleNode.addComponent(UITransform).setContentSize(600, 44);
        const tl = titleNode.addComponent(Label);
        tl.fontSize = 30;
        tl.color = TechText.primary;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        tl.string = '正在加载…';
        root.addChild(titleNode);
        this.loadingLabel = tl;

        // 旋转装饰弧（两段错位弧线，持续旋转表示“进行中”）
        const spin = new Node('Spin');
        spin.layer = layer;
        spin.setPosition(0, 190, 0);
        spin.addComponent(UITransform).setContentSize(120, 120);
        const sg = spin.addComponent(Graphics);
        sg.strokeColor = new Color(0, 214, 255, 120);
        sg.lineWidth = 3;
        sg.arc(0, 0, LOADING_SPIN_R, 0, Math.PI * 0.55);
        sg.stroke();
        sg.strokeColor = new Color(120, 200, 255, 80);
        sg.arc(0, 0, LOADING_SPIN_R, Math.PI, Math.PI * 1.55);
        sg.stroke();
        root.addChild(spin);
        // 旋转由 update(dt) 手动驱动（字段引用），不用 tween：
        // 避免节点销毁后 tween 仍在回调中访问已毁节点导致崩溃
        this.spinNode = spin;

        // 双进度条：模型加载 + 效果预缓存
        const barModel = this.createLoadingBar(root, 'BarModel', '模型加载', 20);
        this.loadingModelBar = barModel.fill;
        this.loadingModelPct = barModel.pct;
        const barFx = this.createLoadingBar(root, 'BarFx', '效果预缓存', -62);
        this.loadingFxBar = barFx.fill;
        this.loadingFxPct = barFx.pct;
    }

    /**
     * 创建一条加载进度条：标签（左上，锚点 x=0）+ 百分比（右上，锚点 x=1）
     * + 深色底槽 + 青色填充。返回填充 Graphics 与百分比 Label，供进度更新时重绘。
     */
    private createLoadingBar(parent: Node, name: string, label: string, y: number): { fill: Graphics; pct: Label } {
        const layer = parent.layer;
        const halfW = LOADING_BAR_W / 2;

        // 标签（左对齐：锚点 x=0，传入的 x 即文字左缘）
        const labNode = new Node(name + 'Lab');
        labNode.layer = layer;
        const labUt = labNode.addComponent(UITransform);
        labUt.setContentSize(240, 30);
        labUt.setAnchorPoint(0, 0.5);
        labNode.setPosition(-halfW, y + 28, 0);
        const lab = labNode.addComponent(Label);
        lab.string = label;
        lab.fontSize = 20;
        lab.color = TechText.dim;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(labNode);

        // 百分比（右对齐：锚点 x=1，传入的 x 即文字右缘）
        const pctNode = new Node(name + 'Pct');
        pctNode.layer = layer;
        const pctUt = pctNode.addComponent(UITransform);
        pctUt.setContentSize(120, 30);
        pctUt.setAnchorPoint(1, 0.5);
        pctNode.setPosition(halfW, y + 28, 0);
        const pct = pctNode.addComponent(Label);
        pct.string = '0%';
        pct.fontSize = 20;
        pct.color = TechText.caption;
        pct.horizontalAlign = Label.HorizontalAlign.RIGHT;
        pct.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(pctNode);

        // 底槽：深色圆角条 + 细描边
        const bg = new Node(name + 'Bg');
        bg.layer = layer;
        bg.setPosition(0, y, 0);
        bg.addComponent(UITransform).setContentSize(LOADING_BAR_W, LOADING_BAR_H);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(11, 24, 43, 245);
        bgG.roundRect(-halfW, -LOADING_BAR_H / 2, LOADING_BAR_W, LOADING_BAR_H, LOADING_BAR_H / 2);
        bgG.fill();
        bgG.strokeColor = new Color(0, 190, 230, 120);
        bgG.lineWidth = 1;
        bgG.stroke();
        parent.addChild(bg);

        // 填充：单独节点，宽度随进度重绘（初始 0）
        const fill = new Node(name + 'Fill');
        fill.layer = layer;
        fill.setPosition(0, y, 0);
        fill.addComponent(UITransform).setContentSize(LOADING_BAR_W, LOADING_BAR_H);
        const fillG = fill.addComponent(Graphics);
        this.drawLoadingBar(fillG, 0);
        parent.addChild(fill);

        return { fill: fillG, pct };
    }

    /** 更新模型加载进度（进度条一）：重绘填充与百分比（loaded/total） */
    private updateLoading(loaded: number, total: number): void {
        const p = total > 0 ? loaded / total : 0;
        if (this.loadingModelBar) this.drawLoadingBar(this.loadingModelBar, p);
        if (this.loadingModelPct) this.loadingModelPct.string = `${Math.round(p * 100)}%`;
    }

    /** 更新效果预缓存进度（进度条二）：重绘填充与百分比（done/total 档位数） */
    private updateLoadingFx(done: number, total: number): void {
        const p = total > 0 ? done / total : 0;
        if (this.loadingFxBar) this.drawLoadingBar(this.loadingFxBar, p);
        if (this.loadingFxPct) this.loadingFxPct.string = `${Math.round(p * 100)}%`;
    }

    /** 绘制进度条填充：青色圆角条，宽度 = 槽宽 × p（左侧对齐生长） */
    private drawLoadingBar(g: Graphics, p: number): void {
        const w = LOADING_BAR_W;
        const h = LOADING_BAR_H;
        g.clear();
        const pw = Math.max(0, Math.min(1, p)) * (w - 6);
        if (pw <= 0.5) return;
        g.fillColor = new Color(0, 214, 255, 255);
        g.roundRect(-w / 2 + 3, -(h - 6) / 2, pw, h - 6, (h - 6) / 2);
        g.fill();
    }

    /** 隐藏加载界面：淡出后销毁，then 回调在销毁后执行（需自行校验组件有效性） */
    private hideLoading(then?: () => void): void {
        const root = this.loadingNode;
        if (!root) {
            then?.();
            return;
        }
        this.loadingNode = null;
        this.loadingLabel = null;
        this.loadingModelBar = null;
        this.loadingModelPct = null;
        this.loadingFxBar = null;
        this.loadingFxPct = null;
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
                if (!this.modelRoot) {
                    this.hideLoading();
                    this.setStatus('模型根节点缺失，无法预览');
                    return;
                }
                // 加载完成：默认加载第一个模型（先隐藏），读条期间预缓存其碎片模板
                // （第二根进度条），预缓存完成再收起加载界面并亮出模型，
                // 保证首次播放任意解体特效都直接命中缓存、零卡顿
                // 默认模型取路径序第一个（loaded 按完成顺序入队，需排序保证确定性）
                const first = [...loaded].sort((a, b) => a.path.localeCompare(b.path))[0];
                const model = instantiate(first.prefab);
                this.resetFx();
                this.clearModel();
                this.modelRoot.addChild(model);
                this.currentModel = model;
                // 缓存 key 用 prefab 资源 uuid：重进场景时新实例也能命中 ShardStore
                this.currentPrefabUuid = first.prefab.uuid;
                // 预缓存期间保持隐藏：碎片模板只记录来源节点路径，矩阵在播放时按当前朝向实时换算
                model.active = false;
                this.spin = false;
                this.refreshFxButtons();
                this.precacheShardTemplates(first.prefab.uuid, model, () => {
                    if (!this.isValid) return;
                    // 收起加载界面后亮出模型，再展示模型列表
                    this.hideLoading(() => {
                        if (!this.isValid) return;
                        this.revealModel(model);
                        this.showModelButtons(loaded);
                        this.setStatus('共找到 ' + loaded.length + ' 个模型，已默认加载第一个，点击左侧按钮切换');
                    });
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
        // 不再清碎片缓存：ShardStore 按 prefab uuid 隔离各模型（上限 4 个），切走的模型
        // 缓存仍在、切回即命中；旧模型节点销毁不影响缓存（缓存只存 Mesh + 节点路径）
        this.clearModel();
        const model = instantiate(prefab);
        this.modelRoot!.addChild(model);
        this.currentModel = model;
        this.currentPrefabUuid = prefab.uuid;
        this.spin = false;
        this.revealModel(model);
        this.setStatus('已加载模型: ' + (prefab.name || 'unknown'));
        this.refreshFxButtons();
    }

    /** 亮出模型：激活后延迟一帧执行 fitModel（包围盒换算需要激活后的世界矩阵），并恢复自旋 */
    private revealModel(model: Node): void {
        model.active = true;
        this.scheduleOnce(() => {
            // 延迟一帧执行，期间场景可能已切换，先校验组件与模型根节点
            if (!this.isValid || !this.modelRoot) return;
            this.fitModel(model);
            this.spin = true;
        }, 0);
    }

    /**
     * 启动读条期碎片模板预缓存：对指定模型按全部档位（碎裂 10/60/120，非碎裂模式共用
     * FX_MAX_SHARDS=120）预先切好网格并写入 ShardStore。切网格与解体模式无关，
     * 全部档位缓存后，首次播放任意解体特效都直接命中缓存，消除首次卡顿。
     * 每档命中顺序：内存 store → native 磁盘缓存（读文件重建 Mesh，仅剩 GPU 上传）
     * → 现场切割（切完异步入盘）。由 update 每帧处理一档（见 precacheTick），
     * 切期间进度条可实时重绘；模型保持隐藏（模板只记录来源节点路径，矩阵在播放时
     * 按当前世界矩阵实时换算）。
     * @param prefabUuid 模型的 prefab 资源 uuid（缓存 key，跨场景稳定）
     */
    private precacheShardTemplates(prefabUuid: string, model: Node, onDone: () => void): void {
        // 全部档位去重：碎裂三档 + 非碎裂模式档位（FX_MAX_SHARDS 与 shatter120 同档）
        const caps = allShardCaps();
        this.updateLoadingFx(0, caps.length);
        // 注册任务，首帧先画出 0%，下一帧 update 开始处理第一档
        this.precacheJob = {
            prefabUuid,
            model,
            caps,
            total: caps.length,
            fingerprint: modelFingerprint(model),
            subs: null,
            onDone,
        };
    }

    /** 预缓存推进一档：查缓存/切当前档位碎片模板并更新进度条，队列空了执行完成回调 */
    private precacheTick(): void {
        const job = this.precacheJob;
        if (!job) return;
        const cap = job.caps.shift();
        if (cap === undefined) {
            // 全部档位缓存完成：清理任务并回调（收起加载界面、亮出模型）
            this.precacheJob = null;
            job.onDone();
            return;
        }
        if (!ShardStore.has(job.prefabUuid, cap)) {
            // 先查 native 磁盘缓存：命中则重建 Mesh 跳过切割（仅剩 GPU 上传）；
            // 浏览器预览无文件系统，loadDisk 直接返回 null 走现场切割
            const diskBlobs = ShardStore.loadDisk(job.prefabUuid, cap, job.fingerprint);
            if (diskBlobs && diskBlobs.length > 0) {
                ShardStore.set(job.prefabUuid, cap, ShardStore.buildEntries(diskBlobs));
            } else {
                // 未命中：现场切割。首次切割读取全部子网格属性并缓存到 job.subs，
                // 后续档位直接复用——原实现每档都 readAttribute 全量拷贝一遍（×3 档）
                if (!job.subs) {
                    job.subs = new Map();
                    // getComponentsInChildren 会一并遍历非激活节点，隐藏状态不影响提取
                    for (const r of job.model.getComponentsInChildren(MeshRenderer)) {
                        job.subs.set(r, readSubMeshes(r));
                    }
                }
                const blobs: ShardBlob[] = [];
                for (const [r, subs] of job.subs) extractShards(r, job.model, blobs, cap, subs);
                if (blobs.length > 0) {
                    ShardStore.set(job.prefabUuid, cap, ShardStore.buildEntries(blobs));
                    // native 上异步落盘，下次启动读文件重建；浏览器预览内部自动跳过
                    ShardStore.saveDiskAsync(job.prefabUuid, cap, blobs, job.fingerprint);
                }
            }
        }
        if (job.caps.length === 0) job.subs = null; // 三档处理完释放属性缓存
        this.updateLoadingFx(job.total - job.caps.length, job.total);
    }

    /**
     * 把 ShardStore 缓存条目绑定到当前模型实例：按节点路径重新解析来源渲染节点，
     * 材质从当前实例的渲染器取（旧实例已销毁，节点引用与材质实例都不能跨场景复用）。
     * 任一路径解析失败返回 null（调用方回退重新切割）。
     */
    private bindEntries(model: Node, entries: ShardEntry[]): ShardTemplate[] | null {
        const out: ShardTemplate[] = [];
        for (const e of entries) {
            const srcNode = resolveNodePath(model, e.nodePath);
            if (!srcNode) return null;
            const mr = srcNode.getComponent(MeshRenderer);
            const material = mr ? (mr.getMaterialInstance(0) ?? mr.material) : null;
            out.push({ mesh: e.mesh, material, srcNode });
        }
        return out;
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
     * 播放特效：把当前模型的网格按三角形分组裂成独立碎片，
     * 隐藏原模型，碎片按所选模式（爆裂/碎裂/汽化/黑洞/旋风/切割/熔陷）运动，
     * 播放完毕后恢复原模型。播放中/未选中模型时忽略点击。
     */
    private playFx(mode: FxMode): void {
        // 冻结定格中允许点击切换（重新播放并解除冻结），仅正常播放中拦截
        if (this.fxRunning && !this.fxFrozen) {
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

        // 碎片总量上限：碎裂三档为 10/60/120，其余模式沿用默认上限
        const cap = FX_SHATTER_CAPS[mode] ?? FX_MAX_SHARDS;

        // 碎片模板按 prefab uuid+档位 缓存（ShardStore，跨场景复用的静态缓存）：
        // 同一模型重复播放（或同档位切换模式）直接复用，不再重新切网格与上传显存
        const prefabUuid = this.currentPrefabUuid || model.uuid;
        let templates: ShardTemplate[] | null = null;
        const entries = ShardStore.get(prefabUuid, cap);
        if (entries) templates = this.bindEntries(model, entries);
        if (!templates) {
            // 未命中（首次播放/切过模型/浏览器刷新后）：现场切网格并写缓存
            const blobs: ShardBlob[] = [];
            // 遍历所有 MeshRenderer 提取碎片（切网格与模式无关，运动参数在生成节点时按模式赋予）
            const renderers = model.getComponentsInChildren(MeshRenderer);
            for (const r of renderers) {
                extractShards(r, model, blobs, cap);
            }
            if (blobs.length === 0) {
                shardRoot.destroy();
                this.shardRoot = null;
                this.setStatus('当前模型没有可碎裂的网格数据');
                return;
            }
            const built = ShardStore.buildEntries(blobs);
            ShardStore.set(prefabUuid, cap, built);
            ShardStore.saveDiskAsync(prefabUuid, cap, blobs, modelFingerprint(model));
            templates = this.bindEntries(model, built);
            if (!templates) {
                // 理论兜底：刚切的模板必定能绑定到当前实例；真失败按无数据对待
                shardRoot.destroy();
                this.shardRoot = null;
                this.setStatus('碎片模板绑定失败，无法播放特效');
                return;
            }
        }

        // 由模板生成碎片节点并赋予运动参数
        this.spawnShards(templates, mode);

        // 隐藏原模型，碎片接管展示
        model.active = false;

        // 爆裂/切割模式：中央能量闪光冲击波
        if (mode === 'burst' || mode === 'slice') this.createFlash();

        this.fxRunning = true;
        this.refreshFxButtons();
        this.setStatus(`${FX_LABELS[mode]}！模型裂成 ${this.shards.length} 块${FX_VERBS[mode]}`);
    }

    // ================= 引擎特效演示 =================

    /**
     * 播放引擎特效演示：在预览区展示各类 Cocos 引擎特效的实现效果
     * （Tween 缓动 / MotionStreak 拖尾 / SpotLight 探照灯 / SphereLight 脉冲光 /
     *  Graphics 冲击波 / ParticleSystem 粒子 / DirectionalLight 实时阴影 / Camera 震屏）。
     * 与解体特效互斥（共用 fxRunning），播放中/未选中模型时忽略点击。
     */
    private playEngineFx(kind: EngineFxKind): void {
        // 冻结定格中允许点击切换（重新播放并解除冻结），仅正常播放中拦截
        if (this.fxRunning && !this.fxFrozen) {
            this.setStatus('特效播放中，请稍候…');
            return;
        }
        if (!this.currentModel || !this.modelRoot) {
            this.setStatus('请先在左侧选择一个模型');
            return;
        }

        this.resetFx();
        this.engineFx = kind;
        this.fxTimer = 0;
        this.fxNodes = [];
        this.shockRings = [];
        this.trailAngle = 0;

        switch (kind) {
            case 'easing': this.fxEasingTrack(); break;
            case 'trail': this.fxTrailBall(); break;
            case 'spotlight': this.fxSpotlightSweep(); break;
            case 'pulse': this.fxPulseLight(); break;
            case 'shockwave': this.fxShockwaveRings(); break;
            case 'particle': this.fxParticleBurst(); break;
            case 'shadow': this.fxShadow(); break;
            case 'shake': this.fxCameraShake(); break;
        }

        this.fxRunning = true;
        this.refreshFxButtons();
        this.setStatus(`${ENGINE_FX_LABELS[kind]} 演示播放中…`);
    }

    /**
     * Tween 缓动赛道：一排小球用不同缓动函数同时从左跑到右，直观对比引擎 tween 缓动。
     */
    private fxEasingTrack(): void {
        const startX = -520;
        const endX = 520;
        FX_EASING_LIST.forEach((item, i) => {
            const y = 210 - i * 42;
            // 小球
            const ball = new Node('EaseBall_' + item.label);
            ball.layer = UI_LAYER;
            ball.setPosition(startX, y, 0);
            ball.addComponent(UITransform).setContentSize(28, 28);
            const bg = ball.addComponent(Graphics);
            bg.fillColor = new Color(0, 214, 255, 255);
            bg.arc(0, 0, 14, 0, Math.PI * 2);
            bg.fill();
            this.node.addChild(ball);
            this.fxNodes.push(ball);
            // 缓动函数名
            const labNode = new Node('EaseLab_' + item.label);
            labNode.layer = UI_LAYER;
            labNode.setPosition(endX + 60, y, 0);
            labNode.addComponent(UITransform).setContentSize(200, 24);
            const l = labNode.addComponent(Label);
            l.string = item.label;
            l.fontSize = 18;
            l.color = TechText.caption;
            l.horizontalAlign = Label.HorizontalAlign.LEFT;
            l.verticalAlign = Label.VerticalAlign.CENTER;
            this.node.addChild(labNode);
            this.fxNodes.push(labNode);
            // 引擎 tween：不同 easing 同时起跑
            tween(ball).to(2.0, { position: new Vec3(endX, y, 0) }, { easing: item.easing }).start();
        });
    }

    /**
     * MotionStreak 拖尾：飞球沿椭圆轨迹绕行，引擎拖尾组件自动生成渐隐尾迹。
     * 注意：MotionStreak 是 UIRenderable 组件，与 Graphics 同节点会因 uiComp 单组件限制
     * 无法渲染，故拖尾条带与飞球圆点分为两个节点同步移动。
     * 纹理用内置 default_sprite 的 ImageAsset 包装成 Texture2D（preview 下内置路径直载会 404）。
     */
    private fxTrailBall(): void {
        // 拖尾条带节点
        const streakNode = new Node('TrailStreak');
        streakNode.layer = UI_LAYER;
        streakNode.setPosition(0, 0, 0);
        streakNode.addComponent(UITransform).setContentSize(40, 40);
        const streak = streakNode.addComponent(MotionStreak);
        streak.fadeTime = 0.5;
        streak.minSeg = 2;
        streak.stroke = 24;
        this.node.addChild(streakNode);
        this.fxNodes.push(streakNode);

        // 飞球本体（Graphics 圆点）
        const ball = new Node('TrailBall');
        ball.layer = UI_LAYER;
        ball.setPosition(0, 0, 0);
        ball.addComponent(UITransform).setContentSize(40, 40);
        const bg = ball.addComponent(Graphics);
        bg.fillColor = new Color(255, 240, 200, 255);
        bg.arc(0, 0, 10, 0, Math.PI * 2);
        bg.fill();
        this.node.addChild(ball);
        this.fxNodes.push(ball);

        // 内置白色纹理：default_sprite 的 ImageAsset（uuid 为引擎内置资源）包成 Texture2D
        assetManager.loadAny({ uuid: '20835ba4-6145-4fbc-a58a-051ce700aa3e' }, (err, img) => {
            if (err || !img) return;
            const tex = new Texture2D();
            tex.image = img;
            streak.texture = tex;
        });
    }

    /** SpotLight 探照灯：隐藏主光后由聚光灯左右扫射模型（前向管线每帧仅 1 盏灯生效） */
    private fxSpotlightSweep(): void {
        const root = this.node.parent;
        if (!root) return;
        // 隐藏主平行光，让聚光灯成为唯一光源
        const topLight = root.getChildByName('TopLight');
        if (topLight) {
            topLight.active = false;
            this.hiddenTopLight = topLight;
        }

        const n = new Node('FxSpotLight');
        n.parent = root;
        // 位于模型前上方，yaw 由 update 摆动扫射
        n.setWorldPosition(new Vec3(960, 500, 480));
        n.setRotationFromEuler(-45, 0, 0);
        const sl = n.addComponent(SpotLight);
        // 直接设 luminance（实测 luminousFlux 换算后过暗，luminance 控制实际亮度）
        sl.luminance = LIGHT_LUMINANCE;
        sl.range = 2600;
        sl.spotAngle = 36;
        sl.color = new Color(255, 255, 255, 255);
        this.fxNodes.push(n);
    }

    /** SphereLight 脉冲光：球形点光源在模型中心做强度呼吸（光照脉冲） */
    private fxPulseLight(): void {
        const root = this.node.parent;
        if (!root) return;
        const topLight = root.getChildByName('TopLight');
        if (topLight) {
            topLight.active = false;
            this.hiddenTopLight = topLight;
        }

        const n = new Node('FxPulseLight');
        n.parent = root;
        // 模型几何中心（modelRoot 世界坐标）
        n.setWorldPosition(new Vec3(960, 360, -50));
        const sl = n.addComponent(SphereLight);
        sl.luminance = LIGHT_LUMINANCE;
        sl.range = 1600;
        sl.size = 0.2;
        sl.color = new Color(255, 190, 120, 255);
        this.fxNodes.push(n);
    }

    /** Graphics 冲击波：三圈错峰扩散的能量环（引擎 2D 绘制 + update 驱动） */
    private fxShockwaveRings(): void {
        const root = this.modelRoot;
        if (!root) return;
        for (let i = 0; i < 3; i++) {
            const n = new Node('ShockRing_' + i);
            n.layer = MODEL_LAYER;
            n.setPosition(0, 0, 0);
            n.addComponent(UITransform).setContentSize(10, 10);
            const g = n.addComponent(Graphics);
            root.addChild(n);
            this.fxNodes.push(n);
            this.shockRings.push({ g, life: 0, delay: i * 0.14 });
        }
    }

    /** 绘制单圈冲击波：t∈[0,1] 半径 20→420、亮度衰减 */
    private drawShockRing(g: Graphics, t: number): void {
        const r = 20 + t * 400;
        g.clear();
        g.strokeColor = new Color(120, 220, 255, Math.round(220 * (1 - t)));
        g.lineWidth = Math.max(1, 10 * (1 - t));
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
    }

    /**
     * ParticleSystem2D 粒子：用内置 default_sprite 纹理发射一团向上喷溅的火花粒子，
     * 通过 classic 属性（emissionRate/life/speed/gravity/startColor 等）配置发射器。
     * 注意：ParticleSystem2D 没有 play()，用 resetSystem() 启动发射；纹理经异步加载后注入。
     */
    private fxParticleBurst(): void {
        const n = new Node('FxParticle');
        n.layer = UI_LAYER;
        n.setPosition(0, 0, 0);
        n.addComponent(UITransform).setContentSize(10, 10);
        const ps = n.addComponent(ParticleSystem2D);
        ps.custom = true;
        ps.playOnLoad = false;
        ps.totalParticles = 150;
        ps.duration = -1;                      // 持续发射
        ps.life = 1.0; ps.lifeVar = 0.5;
        ps.startSize = 26; ps.startSizeVar = 12;
        ps.speed = 260; ps.speedVar = 90;
        ps.angle = 90; ps.angleVar = 180;      // 以向上的 90° 为中心、±180° 扩散
        ps.gravity = new Vec2(0, -240);        // 重力（math.Vec2）
        ps.emissionRate = 150;
        ps.positionType = 0;                   // FREE：粒子脱离发射器独立运动
        ps.startColor = new Color(255, 224, 130, 255);
        ps.startColorVar = new Color(40, 30, 0, 0);
        ps.endColor = new Color(255, 90, 0, 0);
        ps.endColorVar = new Color(0, 0, 0, 0);
        // 模型根被 fitModel 缩放/偏移，挂到 modelRoot 让粒子从模型中心迸发并随模型缩放
        if (this.modelRoot) this.modelRoot.addChild(n);
        else this.node.addChild(n);
        this.fxNodes.push(n);
        // 内置白色纹理：default_sprite 的 ImageAsset 包成 Texture2D 再包 SpriteFrame
        assetManager.loadAny({ uuid: '20835ba4-6145-4fbc-a58a-051ce700aa3e' }, (err, img) => {
            if (err || !img || !n.isValid) return;
            const tex = new Texture2D();
            tex.image = img;
            const sf = new SpriteFrame();
            sf.texture = tex;
            sf.rect = new Rect(0, 0, tex.width, tex.height);
            sf.packable = false;
            ps.spriteFrame = sf;
            ps.resetSystem();                  // 注入纹理后启动发射
        });
    }

    /**
     * DirectionalLight 实时阴影：开启主平行光阴影，模型开启 castShadow，
     * 并在模型后方放一块竖直接收面（MeshRenderer + receiveShadow）承接投影。
     */
    private fxShadow(): void {
        const root = this.node.parent;
        if (!root) return;
        const topLight = root.getChildByName('TopLight');
        const dl = topLight?.getComponent(DirectionalLight);
        if (dl) {
            dl.shadowEnabled = true;
            dl.shadowDistance = 2000;
            dl.shadowBias = 1;
            dl.shadowNormalBias = 0.5;
        }
        // 模型投射阴影
        if (this.currentModel) {
            const mrs = this.currentModel.getComponentsInChildren(MeshRenderer);
            mrs.forEach((mr) => { mr.castShadow = true; this.shadowCasters.push(mr); });
        }
        // 接收面：竖直平面（法线 +Z）置于模型后方略低处，承接主光投影
        const ground = new Node('ShadowGround');
        ground.layer = MODEL_LAYER;
        const mw = this.modelRoot ? this.modelRoot.worldPosition : new Vec3(0, 0, -50);
        ground.setPosition(mw.x, mw.y - 250, mw.z - 55);
        ground.addComponent(UITransform).setContentSize(900, 520);
        const gr = ground.addComponent(MeshRenderer);
        gr.mesh = utils.createMesh({
            positions: [-450, -260, 0, 450, -260, 0, 450, 260, 0, -450, 260, 0],
            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
            indices: [0, 1, 2, 0, 2, 3],
        });
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-standard' });
        gr.material = mat;
        gr.receiveShadow = true;
        root.addChild(ground);
        this.shadowGround = ground;
    }

    /** Camera 震屏：记录主相机初始位置，由 updateEngineFx 每帧抖动并按时间衰减 */
    private fxCameraShake(): void {
        const cam = director.mainCamera;
        if (!cam) return;
        this.shakeCamera = cam;
        this.shakeOrigin = cam.node.position.clone();
    }

    /** 引擎特效逐帧驱动（与解体特效的分支互斥） */
    private updateEngineFx(dt: number): void {
        this.fxTimer += dt;
        const t = this.fxTimer;
        switch (this.engineFx) {
            case 'trail': {
                // 椭圆轨迹飞行（拖尾节点与飞球节点同步移动）
                this.trailAngle += dt * 2.2;
                const tx = Math.cos(this.trailAngle) * 260;
                const ty = Math.sin(this.trailAngle) * 170;
                const streakNode = this.fxNodes[0];
                const ball = this.fxNodes[1];
                if (streakNode) streakNode.setPosition(tx, ty, 0);
                if (ball) ball.setPosition(tx, ty, 0);
                break;
            }
            case 'spotlight': {
                // 聚光灯左右扫射
                const n = this.fxNodes[0];
                if (n) n.setRotationFromEuler(-45, Math.sin(t * 1.1) * 45, 0);
                break;
            }
            case 'pulse': {
                // 亮度呼吸脉冲
                const n = this.fxNodes[0];
                const sl = n?.getComponent(SphereLight);
                if (sl) sl.luminance = LIGHT_LUMINANCE * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4)));
                break;
            }
            case 'shockwave': {
                for (const r of this.shockRings) {
                    r.life += dt;
                    if (r.life < r.delay) continue;
                    const k = (r.life - r.delay) / 0.7;
                    if (k >= 1) r.g.clear();
                    else this.drawShockRing(r.g, k);
                }
                break;
            }
            case 'shake': {
                // 主相机按时间衰减地随机抖动（粒子/阴影为自驱，无需逐帧逻辑）
                const cam = this.shakeCamera;
                if (cam && this.shakeOrigin) {
                    const decay = Math.max(0, 1 - t / ENGINE_FX_DURATION.shake);
                    const amp = 16 * decay;
                    cam.node.setPosition(
                        this.shakeOrigin.x + (Math.random() * 2 - 1) * amp,
                        this.shakeOrigin.y + (Math.random() * 2 - 1) * amp,
                        this.shakeOrigin.z,
                    );
                }
                break;
            }
            default:
                break;
        }
        if (t >= ENGINE_FX_DURATION[this.engineFx]) this.finishFx();
    }

    /** 清理引擎特效节点与临时状态（结束/复位时调用） */
    private clearEngineFx(): void {
        for (const n of this.fxNodes) n.destroy();
        this.fxNodes = [];
        this.shockRings = [];
        this.engineFx = null;
        // 恢复被隐藏的主光
        if (this.hiddenTopLight) {
            this.hiddenTopLight.active = true;
            this.hiddenTopLight = null;
        }
        // 关闭实时阴影并恢复投射器
        if (this.shadowGround) {
            this.shadowGround.destroy();
            this.shadowGround = null;
        }
        if (this.shadowCasters.length > 0) {
            this.shadowCasters.forEach((mr) => { mr.castShadow = false; });
            this.shadowCasters = [];
        }
        const dl = this.node.parent?.getChildByName('TopLight')?.getComponent(DirectionalLight);
        if (dl) dl.shadowEnabled = false;
        // 恢复相机位置
        if (this.shakeCamera && this.shakeOrigin) {
            this.shakeCamera.node.setPosition(this.shakeOrigin);
            this.shakeCamera = null;
            this.shakeOrigin = null;
        }
    }

    /**
     * 由碎片模板生成碎片节点：按来源渲染节点的当前世界矩阵放置（模型会自旋，
     * 矩阵必须实时换算，不能沿用提取时的朝向），挂网格/材质，
     * 碎片局部中心不单独计算：方向基准直接用碎片节点本地坐标。
     */
    private spawnShards(templates: ShardTemplate[], mode: FxMode): void {
        const root = this.shardRoot;
        const modelRoot = this.modelRoot;
        if (!root || !modelRoot) return;
        // modelRoot 世界矩阵的逆矩阵只算一次（原来每个碎片各算一遍）
        const rootInv = Mat4.invert(new Mat4(), modelRoot.worldMatrix);

        for (const tpl of templates) {
            const n = new Node('Shard');
            n.layer = MODEL_LAYER;
            root.addChild(n);
            // Node.matrix setter 直接存本地矩阵（不按父变换换算），
            // 需先把渲染节点的世界矩阵换算到 modelRoot 空间再传入，
            // 顶点是渲染节点局部坐标，这样碎片恰好原位呈现
            const localMatrix = Mat4.multiply(new Mat4(), rootInv, tpl.srcNode.worldMatrix);
            n.matrix = localMatrix;
            // 记录初始缩放（来自渲染节点世界矩阵换算），尾部缩放在此基础上叠加
            const baseScale = new Vec3(n.scale.x, n.scale.y, n.scale.z);
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = tpl.mesh;
            if (tpl.material) mr.material = tpl.material;

            // 方向：碎片本地坐标相对 modelRoot 原点（shardRoot 无附加变换，本地即模型空间）
            const dir = new Vec3(n.position.x, n.position.y, n.position.z);
            if (dir.lengthSqr() < 1e-4) dir.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5);
            dir.normalize();

            // 初速度与角速度（按模式区分）
            const vel = new Vec3();
            const ang = new Vec3();
            let maxLife: number;
            switch (mode) {
                case 'burst':
                    // 爆裂：高速飞溅 + 随机扰动，太空无重力——从模型中心各方向均匀四散飞出。
                    // 原 y 分量有 0.7 压扁 + 160 上扬偏置，是配合重力抛物线设计的；
                    // 去重力后若保留会整体向上漂，故恢复为均匀球面速度
                    maxLife = FX_BURST_LIFE;
                    {
                        const speed = FX_BURST_SPEED * (0.55 + Math.random() * 0.75);
                        vel.set(dir.x * speed, dir.y * speed, dir.z * speed);
                        vel.x += (Math.random() - 0.5) * 160;
                        vel.z += (Math.random() - 0.5) * 160;
                        ang.set((Math.random() - 0.5) * 720, (Math.random() - 0.5) * 720, (Math.random() - 0.5) * 720);
                    }
                    break;
                case 'shatter10':
                case 'shatter60':
                case 'shatter120':
                    // 碎裂（10/60/120 三档）：低速四散 + 打滚，运动参数一致，仅碎片数不同。
                    // 原 y 分量有 0.5 压扁 + 40 上扬偏置，是配合重力塌落设计的；太空无重力
                    // 下去掉，碎片从模型中心各方向匀速漂移散开
                    maxLife = FX_SHATTER_LIFE;
                    {
                        const speed = FX_SHATTER_SPEED * (0.4 + Math.random() * 0.8);
                        vel.set(dir.x * speed + (Math.random() - 0.5) * 60, dir.y * speed, dir.z * speed + (Math.random() - 0.5) * 60);
                        ang.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260);
                    }
                    break;
                case 'vaporize':
                    // 汽化：原位不动，仅微旋（缩小由 updateFx 统一驱动）
                    maxLife = FX_VAPORIZE_LIFE;
                    ang.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
                    break;
                case 'blackhole':
                    // 黑洞：初速为 0，向心加速度在 updateFx 中持续施加
                    maxLife = FX_BLACKHOLE_LIFE;
                    ang.set((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
                    break;
                case 'whirlwind':
                    // 旋风：初速为 0，螺旋运动在 updateFx 中按位置旋转驱动
                    maxLife = FX_WHIRLWIND_LIFE;
                    ang.set((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
                    break;
                case 'slice':
                    // 切割：按所在侧（x 正负）反向分离，绕竖轴翻转
                    maxLife = FX_SLICE_LIFE;
                    {
                        const sign = n.position.x >= 0 ? 1 : -1;
                        const speed = FX_SLICE_SPEED * (0.7 + Math.random() * 0.6);
                        vel.set(sign * speed, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20);
                        ang.set(0, sign * (4 + Math.random() * 3), 0);
                    }
                    break;
                case 'sink':
                    // 熔陷：初速为 0，垂直加速下沉（updateFx 中触底钳制）
                    maxLife = FX_SINK_LIFE;
                    ang.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
                    break;
            }
            this.shards.push({ node: n, vel, ang, life: 0, maxLife, baseScale });
        }
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
        // 引擎特效演示与解体特效分支互斥
        if (this.engineFx) {
            this.updateEngineFx(dt);
            return;
        }
        // 完成度定格：碎片停住（上方闪光不受冻结影响，可自行播完消失）
        if (this.fxFrozen) return;
        for (const sh of this.shards) {
            sh.life += dt;
            if (sh.life >= sh.maxLife) {
                sh.node.destroy();
                continue;
            }
            this.stepShardMotion(sh, dt);
            // 缩小消失：汽化全程线性缩小；熔陷触底后（80% 起）缩小；其余尾部 30% 缩小
            const k = sh.life / sh.maxLife;
            if (this.fxMode === 'vaporize') {
                const s = Math.max(0, 1 - k);
                sh.node.setScale(sh.baseScale.x * s, sh.baseScale.y * s, sh.baseScale.z * s);
            } else if (this.fxMode === 'sink' ? k > 0.8 : k > 0.7) {
                const startK = this.fxMode === 'sink' ? 0.8 : 0.7;
                const s = 1 - (k - startK) / (1 - startK);
                sh.node.setScale(sh.baseScale.x * s, sh.baseScale.y * s, sh.baseScale.z * s);
            }
        }
        this.shards = this.shards.filter((sh) => sh.life < sh.maxLife);

        if (this.shards.length === 0 && !this.fxFlash) {
            this.finishFx();
        }
    }

    /**
     * 单片碎片的运动积分一步（位移 + 旋转，按当前模式；不含生命期累加、销毁与尾部缩小）。
     * updateFx 逐帧调用；完成度快进（freezeAtProgress）也按小步长反复调用，
     * 因此任意模式（含黑洞/旋风/熔陷等积分型运动）都能正确推进到指定完成度。
     */
    private stepShardMotion(sh: ShardRuntime, dt: number): void {
        const p = sh.node.position;
        const e = sh.node.eulerAngles;
        switch (this.fxMode) {
            case 'burst':
            case 'shatter10':
            case 'shatter60':
            case 'shatter120':
                // 太空场景：无重力，碎片沿初速度匀速四散漂移 + 自旋（碎裂为低速打滚）
                sh.node.setPosition(p.x + sh.vel.x * dt, p.y + sh.vel.y * dt, p.z + sh.vel.z * dt);
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
            case 'slice':
                // 切割：重力抛物线 + 位移（shardRoot 无附加变换，本地速度即世界速度）
                sh.vel.y -= FX_GRAVITY * dt;
                sh.node.setPosition(p.x + sh.vel.x * dt, p.y + sh.vel.y * dt, p.z + sh.vel.z * dt);
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
            case 'vaporize':
                // 汽化：原位微旋，缩小在下方统一处理
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
            case 'blackhole': {
                // 黑洞：朝 modelRoot 原点持续加速（速度钳制），靠近后越吸越快
                const to = new Vec3(-p.x, -p.y, -p.z);
                const d = to.length();
                if (d > 1) {
                    to.multiplyScalar(1 / d);
                    sh.vel.add(to.multiplyScalar(FX_BLACKHOLE_G * dt));
                    const sp = sh.vel.length();
                    if (sp > FX_BLACKHOLE_MAX_SPEED) sh.vel.multiplyScalar(FX_BLACKHOLE_MAX_SPEED / sp);
                }
                sh.node.setPosition(p.x + sh.vel.x * dt, p.y + sh.vel.y * dt, p.z + sh.vel.z * dt);
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
            }
            case 'whirlwind': {
                // 旋风：位置绕 y 轴螺旋旋转 + 上升 + 径向外扩
                const th = FX_WHIRLWIND_OMEGA * dt;
                const cos = Math.cos(th);
                const sin = Math.sin(th);
                const nx = p.x * cos - p.z * sin;
                const nz = p.x * sin + p.z * cos;
                const spread = 1 + FX_WHIRLWIND_SPREAD * dt;
                sh.node.setPosition(nx * spread, p.y + FX_WHIRLWIND_UP * dt, nz * spread);
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
            }
            case 'sink':
                // 熔陷：垂直加速下沉，触底后停住（缩小在下方按 80% 后处理）
                sh.vel.y -= FX_SINK_GRAVITY * dt;
                let ny = p.y + sh.vel.y * dt;
                if (ny < FX_SINK_FLOOR) {
                    ny = FX_SINK_FLOOR;
                    sh.vel.y = 0;
                }
                sh.node.setPosition(p.x, ny, p.z);
                sh.node.setRotationFromEuler(e.x + sh.ang.x * dt, e.y + sh.ang.y * dt, e.z + sh.ang.z * dt);
                break;
        }
    }

    /**
     * 完成度按钮：播放当前解体特效，并把动画直接推进到指定完成度 k∈[0,1] 后冻结
     * （从零开始定格，已在播放/冻结中也会重播，保证状态可重复查看）。
     */
    private freezeProgress(k: number): void {
        if (!this.currentModel) {
            this.setStatus('请先在左侧选择一个模型');
            return;
        }
        // 正常播放中不可插入定格（与 playFx 门控一致；冻结中放行——会重播后重新定格）
        if (this.fxRunning && !this.fxFrozen) {
            this.setStatus('特效播放中，请稍候…');
            return;
        }
        this.playFx(this.fxMode);
        if (!this.fxRunning) return; // 无网格数据等失败情况（playFx 已提示）
        this.freezeAtProgress(k);
    }

    /**
     * 将当前解体特效步进到指定完成度并冻结：逐碎片按 1/60 秒步长推进运动积分
     * （最大 1.8s ≈ 108 步，一次性完成无分帧必要），不执行尾部缩小与销毁——
     * 完成度关注的是碎裂散开形态；完成后置 fxFrozen，updateFx 跳过推进，
     * 模型保持隐藏、碎片停在该完成度，直到点击其他特效按钮/切换模型（resetFx 解除）。
     */
    private freezeAtProgress(k: number): void {
        const step = 1 / 60;
        for (const sh of this.shards) {
            const target = Math.min(sh.maxLife, Math.max(sh.life, k * sh.maxLife));
            while (sh.life < target) {
                const d = Math.min(step, target - sh.life);
                sh.life += d;
                this.stepShardMotion(sh, d);
            }
        }
        this.fxFrozen = true;
        this.refreshFxButtons();
        this.setStatus(`已定格 ${Math.round(k * 100)}% 完成度，点击其他特效按钮解除并继续`);
    }

    /** 特效自然结束：恢复原模型可见，清理容器 */
    private finishFx(): void {
        this.fxRunning = false;
        if (this.shardRoot) {
            this.shardRoot.destroy();
            this.shardRoot = null;
        }
        this.shards = [];
        this.clearEngineFx();
        if (this.currentModel) this.currentModel.active = true;
        this.refreshFxButtons();
        this.setStatus('特效播放完毕，可再次点击或切换模型');
    }

    /** 立即复位特效（切换模型/退出场景前调用）：清理碎片与闪光，恢复模型可见 */
    private resetFx(): void {
        this.fxRunning = false;
        this.fxFrozen = false;
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
        this.clearEngineFx();
        if (this.currentModel) this.currentModel.active = true;
        this.refreshFxButtons();
    }
}
