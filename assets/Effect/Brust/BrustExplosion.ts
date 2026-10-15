import {
    _decorator,
    Component,
    Node,
    UITransform,
    ParticleSystem2D,
    Vec2,
    Vec3,
    Color,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Rect,
    tween,
    gfx,
} from 'cc';

const { ccclass } = _decorator;

// 项目 UI 层（与 Home 场景一致：33554432），2D 粒子由 UI 相机渲染
const UI_LAYER = 33554432;

/** 爆炸类型 */
export type BrustType =
    /** 1 燃烧：火球爆炸后在原地持续燃烧一阵（上升火苗 + 飘散余烬） */
    | 'burn'
    /** 2 区域：爆炸同时铺开一片持续存在的火球区域（原地翻涌） */
    | 'zone'
    /** 3 坍缩：先扩张形成火球区域，短暂维持后突然向中心收缩 */
    | 'implode';

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
    /** 发射方向中心角（度，90=正上），默认 90 */
    angle?: number;
    /** 发射方向扩散范围（度），默认 360（全向） */
    angleVar?: number;
    /** 发射点位置方差（形成区域发射），默认 (0,0) 从中心发射 */
    posVar?: Vec2;
}

/** play() 可选参数 */
export interface BrustExplosionOptions {
    /** 爆炸类型，默认 'burn'（燃烧型） */
    type?: BrustType;
    /** 节点层级，默认 UI 层（33554432） */
    layer?: number;
    /** 整体缩放（粒子尺寸/速度/区域半径同步缩放），默认 1 */
    scale?: number;
}

/**
 * 可复用爆炸特效：BrustExplosion.play(parent) 即放即走，也可直接挂到节点上。
 *
 * 所有粒子共用一张运行时生成的圆形径向渐变小光球贴图（中心实、边缘透明衰减），
 * 叠加后形成圆形火球而非方块；全部加法混合，重叠处过曝形成白热核心。
 * 三种类型（BrustType）：
 *   burn    爆炸（白热核心 + 橙红火球 + 亮黄火花）后接持续上升火苗与飘散余烬
 *   zone    爆炸同时铺开一片原地翻涌的火球区域
 *   implode 先扩张出火球区域，维持后突然向中心收缩并闪一下
 * 播放结束自动销毁节点。
 */
@ccclass('BrustExplosion')
export class BrustExplosion extends Component {
    /** 共享的圆形光球贴图（所有爆炸实例复用，只生成一次） */
    private static _glowFrame: SpriteFrame | null = null;

    private _type: BrustType = 'burn';
    private _scale = 1;

    /**
     * 在 parent 下播放一次爆炸，结束后节点自动销毁。
     * @param parent 爆炸挂载节点（粒子从该节点原点迸发）
     */
    static play(parent: Node, options?: BrustExplosionOptions): BrustExplosion {
        const n = new Node('BrustExplosion');
        n.layer = options?.layer ?? UI_LAYER;
        const fx = n.addComponent(BrustExplosion);
        fx._type = options?.type ?? 'burn';
        fx._scale = options?.scale ?? 1;
        parent.addChild(n);
        return fx;
    }

    onLoad(): void {
        const frame = BrustExplosion.getGlowFrame();
        const systems: ParticleSystem2D[] = [];
        let totalLife: number;

        if (this._type === 'burn') {
            // 1 燃烧型：半速爆炸 + 持续火苗余烬
            this.buildExplosion(frame, systems);
            this.buildBurn(frame, systems);
            totalLife = 4.2;
        } else if (this._type === 'zone') {
            // 2 区域型：半速爆炸 + 同时铺开火球区域
            this.buildExplosion(frame, systems);
            this.buildZoneFire(frame, systems, this.node, 2.4);
            totalLife = 3.8;
        } else {
            // 3 坍缩型：初始闪光 + 火球区域扩张→维持→突然收缩
            totalLife = this.buildImplode(frame, systems);
        }

        for (const ps of systems) ps.resetSystem();
        this.scheduleOnce(() => this.node.destroy(), totalLife);
    }

    /**
     * 基础爆炸三层（速度已整体降低 50%：速度减半、生命/发射窗口翻倍，
     * 粒子最终扩散半径不变但过程慢一倍）：白热核心 / 橙红火球 / 亮黄火花。
     */
    private buildExplosion(frame: SpriteFrame | null, out: ParticleSystem2D[]): void {
        out.push(
            this.createEmitter('BrustCore', {
                totalParticles: 28,
                duration: 0.36,
                life: 0.6,
                lifeVar: 0.24,
                startSize: 180,
                startSizeVar: 60,
                endSize: 320,
                endSizeVar: 100,
                speed: 30,
                speedVar: 60,
                startColor: new Color(255, 250, 235),
                startColorVar: new Color(20, 20, 20, 0),
                endColor: new Color(255, 220, 150, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
            this.createEmitter('BrustFire', {
                totalParticles: 180,
                duration: 0.9,
                life: 1.1,
                lifeVar: 0.6,
                startSize: 90,
                startSizeVar: 40,
                endSize: 190,
                endSizeVar: 80,
                speed: 190,
                speedVar: 150,
                startColor: new Color(255, 210, 120),
                startColorVar: new Color(40, 45, 30, 0),
                endColor: new Color(255, 60, 10, 0),
                endColorVar: new Color(0, 20, 30, 0),
            }, frame),
            this.createEmitter('BrustSparks', {
                totalParticles: 90,
                duration: 0.7,
                life: 1.2,
                lifeVar: 0.7,
                startSize: 10,
                startSizeVar: 5,
                endSize: 4,
                endSizeVar: 3,
                speed: 310,
                speedVar: 130,
                startColor: new Color(255, 235, 160),
                startColorVar: new Color(30, 25, 20, 0),
                endColor: new Color(255, 120, 20, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
        );
    }

    /** 燃烧型专属：爆炸后原地持续 2s 左右的上升火苗与飘散余烬 */
    private buildBurn(frame: SpriteFrame | null, out: ParticleSystem2D[]): void {
        out.push(
            // 火苗：在爆炸区域内低速向上翻涌，大颗粒橙黄→暗红
            this.createEmitter('BrustFlame', {
                totalParticles: 220,
                duration: 1.8,
                life: 0.75,
                lifeVar: 0.35,
                startSize: 70,
                startSizeVar: 30,
                endSize: 30,
                endSizeVar: 15,
                speed: 50,
                speedVar: 28,
                angle: 90,
                angleVar: 28,
                posVar: new Vec2(60, 60),
                startColor: new Color(255, 190, 90),
                startColorVar: new Color(40, 40, 25, 0),
                endColor: new Color(220, 50, 10, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
            // 余烬：小颗粒亮黄点，从区域内缓慢飘升后暗成红色
            this.createEmitter('BrustEmber', {
                totalParticles: 60,
                duration: 2.0,
                life: 1.4,
                lifeVar: 0.6,
                startSize: 7,
                startSizeVar: 4,
                endSize: 3,
                endSizeVar: 2,
                speed: 40,
                speedVar: 22,
                angle: 90,
                angleVar: 50,
                posVar: new Vec2(90, 90),
                startColor: new Color(255, 225, 150),
                startColorVar: new Color(25, 25, 20, 0),
                endColor: new Color(255, 90, 20, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame),
        );
    }

    /** 区域型火球：在半径约 150 的区域内原地翻涌的大颗粒火团（近零位移） */
    private buildZoneFire(
        frame: SpriteFrame | null,
        out: ParticleSystem2D[],
        parent: Node,
        duration: number,
    ): ParticleSystem2D {
        const ps = this.createEmitter('BrustZone', {
            totalParticles: 260,
            duration,
            life: 0.9,
            lifeVar: 0.4,
            startSize: 110,
            startSizeVar: 45,
            endSize: 150,
            endSizeVar: 60,
            speed: 15,
            speedVar: 12,
            posVar: new Vec2(150, 150),
            startColor: new Color(255, 170, 70),
            startColorVar: new Color(40, 40, 30, 0),
            endColor: new Color(230, 60, 10, 0),
            endColorVar: new Color(0, 20, 20, 0),
        }, frame, parent);
        out.push(ps);
        return ps;
    }

    /**
     * 坍缩型：白热闪光后，火球区域从 scale 0 扩张形成（0.6s），
     * 维持 0.7s，再在 0.22s 内突然缩回 0；收缩瞬间补一颗白热闪光。
     * 返回整体存活时长（秒）。
     */
    private buildImplode(frame: SpriteFrame | null, out: ParticleSystem2D[]): number {
        // 初始白热闪光（不向外迸发，只在中心亮起）
        out.push(this.createEmitter('BrustFlash', {
            totalParticles: 24,
            duration: 0.3,
            life: 0.4,
            lifeVar: 0.15,
            startSize: 160,
            startSizeVar: 50,
            endSize: 260,
            endSizeVar: 80,
            speed: 20,
            speedVar: 40,
            startColor: new Color(255, 248, 230),
            startColorVar: new Color(20, 20, 20, 0),
            endColor: new Color(255, 210, 140, 0),
            endColorVar: new Color(0, 0, 0, 0),
        }, frame));

        // 火球区域容器：缩放由 tween 驱动，内部粒子随容器整体扩张/收缩
        const zone = new Node('BrustZone');
        zone.layer = this.node.layer;
        zone.setScale(0, 0, 0);
        this.node.addChild(zone);
        this.buildZoneFire(frame, out, zone, 1.6);

        const s = this._scale;
        tween(zone)
            .to(0.6, { scale: new Vec3(s, s, s) }, { easing: 'cubicOut' }) // 扩张形成火球区域
            .delay(0.7)                                                    // 短暂维持
            .to(0.22, { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' }) // 突然向中心收缩
            .start();

        // 收缩瞬间在中心补一颗白热闪光（挂根节点，不随容器缩小）
        this.scheduleOnce(() => {
            const flash = this.createEmitter('BrustCollapseFlash', {
                totalParticles: 20,
                duration: 0.15,
                life: 0.35,
                lifeVar: 0.12,
                startSize: 200,
                startSizeVar: 60,
                endSize: 60,
                endSizeVar: 20,
                speed: 10,
                speedVar: 20,
                startColor: new Color(255, 250, 235),
                startColorVar: new Color(20, 20, 20, 0),
                endColor: new Color(255, 200, 120, 0),
                endColorVar: new Color(0, 0, 0, 0),
            }, frame);
            flash.resetSystem();
        }, 1.3);

        return 2.0;
    }

    /** 按配置创建一个加法混合粒子发射器（默认挂在特效根节点，全向、无重力） */
    private createEmitter(
        name: string,
        cfg: EmitterConfig,
        frame: SpriteFrame | null,
        parent: Node = this.node,
    ): ParticleSystem2D {
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
        ps.angle = cfg.angle ?? 90;
        ps.angleVar = cfg.angleVar ?? 360; // 默认全向均匀四散
        ps.gravity = new Vec2(0, 0); // 太空无重力，保持球状扩张
        if (cfg.posVar) ps.posVar = new Vec2(cfg.posVar.x * this._scale, cfg.posVar.y * this._scale);
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

        parent.addChild(n);
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
