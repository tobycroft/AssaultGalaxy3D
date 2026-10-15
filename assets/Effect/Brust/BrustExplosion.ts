import {
    _decorator,
    Component,
    Node,
    UITransform,
    ParticleSystem2D,
    Vec2,
    Color,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Rect,
    gfx,
} from 'cc';

const { ccclass } = _decorator;

// 项目 UI 层（与 Home 场景一致：33554432），2D 粒子由 UI 相机渲染
const UI_LAYER = 33554432;

/** 爆炸整体存活时长（秒）：最后一批粒子消亡后自动销毁节点 */
const FX_TOTAL_LIFE = 1.5;

/** 单个发射器配置（ParticleSystem2D classic 属性子集） */
interface EmitterConfig {
    totalParticles: number;
    duration: number;
    life: number;
    lifeVar: number;
    startSize: number;
    startSizeVar: number;
    endSize: number;
    endSizeVar: number;
    speed: number;
    speedVar: number;
    startColor: Color;
    startColorVar: Color;
    endColor: Color;
    endColorVar: Color;
}

/** play() 可选参数 */
export interface BrustExplosionOptions {
    /** 节点层级，默认 UI 层（33554432） */
    layer?: number;
    /** 整体缩放（粒子尺寸同步缩放），默认 1 */
    scale?: number;
}

/**
 * 可复用爆炸特效（BrustExplosion.play(parent) 即放即走，也可直接挂到节点上）。
 *
 * 三层 ParticleSystem2D 加法混合粒子，共用一张运行时生成的圆形径向渐变小光球贴图：
 *   1. BrustCore   —— 白热核心闪光，大颗粒、短生命、极短发射窗口
 *   2. BrustFire   —— 橙红火球，全向高速迸发并持续膨胀
 *   3. BrustSparks —— 亮黄细碎火花，速度最快、颗粒最小
 * 贴图中心实、边缘透明衰减，叠加后形成圆形火球而非方块；播放结束自动销毁节点。
 */
@ccclass('BrustExplosion')
export class BrustExplosion extends Component {
    /** 共享的圆形光球贴图（所有爆炸实例复用，只生成一次） */
    private static _glowFrame: SpriteFrame | null = null;

    private _scale = 1;
    private _systems: ParticleSystem2D[] = [];

    /**
     * 在 parent 下播放一次爆炸，结束后节点自动销毁。
     * @param parent 爆炸挂载节点（粒子从该节点原点迸发）
     */
    static play(parent: Node, options?: BrustExplosionOptions): BrustExplosion {
        const n = new Node('BrustExplosion');
        n.layer = options?.layer ?? UI_LAYER;
        const fx = n.addComponent(BrustExplosion);
        fx._scale = options?.scale ?? 1;
        parent.addChild(n);
        return fx;
    }

    onLoad(): void {
        const frame = BrustExplosion.getGlowFrame();

        this._systems.push(
            this.createEmitter('BrustCore', {
                totalParticles: 28,
                duration: 0.18,
                life: 0.3,
                lifeVar: 0.12,
                startSize: 180,
                startSizeVar: 60,
                endSize: 320,
                endSizeVar: 100,
                speed: 60,
                speedVar: 120,
                startColor: new Color(255, 250, 235),
                startColorVar: new Color(20, 20, 20, 0),
                endColor: new Color(255, 220, 150, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
            this.createEmitter('BrustFire', {
                totalParticles: 180,
                duration: 0.45,
                life: 0.55,
                lifeVar: 0.3,
                startSize: 90,
                startSizeVar: 40,
                endSize: 190,
                endSizeVar: 80,
                speed: 380,
                speedVar: 300,
                startColor: new Color(255, 210, 120),
                startColorVar: new Color(40, 45, 30, 0),
                endColor: new Color(255, 60, 10, 0),
                endColorVar: new Color(0, 20, 30, 0),
            }, frame),
            this.createEmitter('BrustSparks', {
                totalParticles: 90,
                duration: 0.35,
                life: 0.6,
                lifeVar: 0.35,
                startSize: 10,
                startSizeVar: 5,
                endSize: 4,
                endSizeVar: 3,
                speed: 620,
                speedVar: 260,
                startColor: new Color(255, 235, 160),
                startColorVar: new Color(30, 25, 20, 0),
                endColor: new Color(255, 120, 20, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
        );

        for (const ps of this._systems) ps.resetSystem();
        this.scheduleOnce(() => this.node.destroy(), FX_TOTAL_LIFE);
    }

    /** 按配置创建一个全向迸发、无重力、加法混合的粒子发射器 */
    private createEmitter(name: string, cfg: EmitterConfig, frame: SpriteFrame | null): ParticleSystem2D {
        const n = new Node(name);
        n.layer = this.node.layer;
        n.setPosition(0, 0, 0);
        n.addComponent(UITransform).setContentSize(10, 10);

        const ps = n.addComponent(ParticleSystem2D);
        ps.custom = true;
        ps.playOnLoad = false;
        ps.totalParticles = cfg.totalParticles;
        ps.duration = cfg.duration;
        ps.life = cfg.life;
        ps.lifeVar = cfg.lifeVar;
        ps.startSize = cfg.startSize * this._scale;
        ps.startSizeVar = cfg.startSizeVar * this._scale;
        ps.endSize = cfg.endSize * this._scale;
        ps.endSizeVar = cfg.endSizeVar * this._scale;
        ps.speed = cfg.speed * this._scale;
        ps.speedVar = cfg.speedVar * this._scale;
        ps.angle = 90;
        ps.angleVar = 360; // 全向均匀四散
        ps.gravity = new Vec2(0, 0); // 太空无重力，保持球状扩张
        ps.emissionRate = cfg.totalParticles / cfg.duration;
        ps.positionType = 0; // FREE：粒子脱离发射器独立运动
        ps.startColor = cfg.startColor;
        ps.startColorVar = cfg.startColorVar;
        ps.endColor = cfg.endColor;
        ps.endColorVar = cfg.endColorVar;
        if (frame) ps.spriteFrame = frame;

        // 加法混合：粒子重叠处过曝形成白热核心。
        // UIRenderer 的混合因子访问器为 engineInternal（未进 d.ts），运行时有效
        const blend = ps as unknown as { srcBlendFactor: number; dstBlendFactor: number };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;

        this.node.addChild(n);
        return ps;
    }

    /**
     * 生成（并缓存）圆形径向渐变小光球贴图：中心实白、边缘透明衰减。
     * 用离屏 canvas 绘制后包成 Texture2D/SpriteFrame，全程同步；
     * 无 DOM 环境（如部分原生平台）拿不到 canvas 时返回 null，回退引擎默认贴图。
     */
    private static getGlowFrame(): SpriteFrame | null {
        if (this._glowFrame) return this._glowFrame;

        const size = 64;
        const doc = (globalThis as { document?: Document }).document;
        if (!doc) return null;
        const canvas = doc.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const half = size / 2;
        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0.0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const img = new ImageAsset(canvas);
        const tex = new Texture2D();
        tex.image = img;
        const sf = new SpriteFrame();
        sf.texture = tex;
        sf.rect = new Rect(0, 0, size, size);
        sf.packable = false;
        this._glowFrame = sf;
        return sf;
    }
}
