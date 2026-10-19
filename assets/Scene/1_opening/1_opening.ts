import { _decorator, Component, Node, Vec3, Color, tween, resources, Prefab, instantiate, geometry, MeshRenderer, ParticleSystem, Gradient, CurveRange, GradientRange, SpriteFrame, Texture2D, ImageAsset, Rect, warn, js, Material, builtinResMgr } from 'cc';

const { ccclass } = _decorator;

const SHIP_DIR = 'Model/spaceship';
const TARGET_SHIP_SIZE = 380;

const DOLLY_DURATION = 12.0;
const ORBIT_EASING = 'cubicInOut';

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;

const Z_DEEP_SPACE = SHIP_HALF_SIZE * 100;
const Z_TAIL = SHIP_HALF_SIZE * 2.4;

const ANGLE_TAN = Math.tan(15 * Math.PI / 180);

/**
 * 引擎内部粒子模块的最小字段约定。
 * Cocos 3.8 未从 cc 导出这些模块类，且运行时（预览/构建）中 ParticleSystem 的
 * shapeModule / colorOverLifetimeModule / sizeOvertimeModule getter 返回 null
 * （仅编辑器内会懒创建实例），故按 ccclass 注册名手动 new 并经 setter 赋值。
 */
interface FlameShapeModule {
    shapeType: number;
    radius: number;
    angle: number;
}

interface FlameColorModule {
    enable: boolean;
    color: GradientRange;
}

interface FlameSizeModule {
    enable: boolean;
    size: CurveRange;
}

@ccclass('Opening')
export class Opening extends Component {

    private cameraRig: Node | null = null;
    private cameraNode: Node | null = null;
    private fitRetryCount = 0;

    onLoad(): void {
        this.findCameraNodes();
        this.setCameraToDeepSpace();
        this.loadShip();
    }

    private findCameraNodes(): void {
        this.cameraRig = this.node.getChildByName('CameraRig');
        if (!this.cameraRig) {
            warn('[Opening] CameraRig node not found');
            return;
        }
        this.cameraNode = this.cameraRig.getChildByName('Camera');
        if (!this.cameraNode) {
            warn('[Opening] Camera node not found');
        }
    }

    private setCameraToDeepSpace(): void {
        if (!this.cameraRig || !this.cameraNode) return;
        this.cameraRig.setPosition(0, 0, 0);
        this.cameraRig.setRotationFromEuler(0, 0, 0);
        this.cameraNode.setPosition(0, Z_DEEP_SPACE * ANGLE_TAN, Z_DEEP_SPACE);
        this.cameraNode.lookAt(Vec3.ZERO);
    }

    private loadShip(): void {
        const infos = resources.getDirWithPath(SHIP_DIR, Prefab);
        if (!infos || infos.length === 0) {
            warn('[Opening] No ship model found in', SHIP_DIR);
            return;
        }
        const info = infos[0];
        resources.load(info.path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                warn('[Opening] Failed to load ship model:', err);
                return;
            }
            const ship = instantiate(prefab);
            ship.setPosition(0, 0, 0);
            this.node.addChild(ship);
            this.fitShipWithRetry(ship);
        });
    }

    private fitShip(ship: Node): boolean {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const aabb = new geometry.AABB();
        const renderers = ship.getComponentsInChildren(MeshRenderer);
        let foundBounds = false;
        for (const r of renderers) {
            const m = r.model;
            if (!m || !m.modelBounds) continue;
            foundBounds = true;
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
        if (!foundBounds || !isFinite(minX)) {
            return false;
        }

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = TARGET_SHIP_SIZE / maxDim;

        ship.setScale(scale, scale, scale);
        ship.setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
        return true;
    }

    private startCameraAnimation(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        this.cameraRig.setPosition(0, 0, 0);
        this.cameraRig.setRotationFromEuler(0, 0, 0);
        this.cameraNode.setPosition(0, Z_DEEP_SPACE * ANGLE_TAN, Z_DEEP_SPACE);
        this.cameraNode.lookAt(Vec3.ZERO);

        const startY = Z_DEEP_SPACE * ANGLE_TAN;
        const endY = Z_TAIL * ANGLE_TAN;
        const startZ = Z_DEEP_SPACE;
        const endZ = Z_TAIL;

        tween(this.cameraRig)
            .to(DOLLY_DURATION, { eulerAngles: new Vec3(0, 180, 0) }, {
                easing: ORBIT_EASING,
                onUpdate: (_target: Node, ratio: number) => {
                    const z = startZ + (endZ - startZ) * ratio;
                    const y = startY + (endY - startY) * ratio;
                    this.cameraNode!.setPosition(0, y, z);
                    this.cameraNode!.lookAt(Vec3.ZERO);
                },
            })
            .start();
    }

    private fitShipWithRetry(ship: Node): void {
        if (this.fitShip(ship)) {
            this.createEngineFlame(ship);
            this.startCameraAnimation();
        } else {
            this.fitRetryCount++;
            if (this.fitRetryCount > 10) {
                warn('[Opening] fitShip failed after retries, using fallback scale');
                ship.setScale(TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10);
                ship.setPosition(0, 0, 0);
                this.createEngineFlame(ship);
                this.startCameraAnimation();
                return;
            }
            this.scheduleOnce(() => this.fitShipWithRetry(ship), 0.1);
        }
    }

    private getTailWorldZ(ship: Node): number {
        const aabb = new geometry.AABB();
        const renderers = ship.getComponentsInChildren(MeshRenderer);
        let minZ = Infinity;
        for (const r of renderers) {
            const m = r.model;
            if (!m || !m.modelBounds) continue;
            geometry.AABB.transform(aabb, m.modelBounds, r.node.worldMatrix);
            minZ = Math.min(minZ, aabb.center.z - aabb.halfExtents.z);
        }
        return isFinite(minZ) ? minZ : -SHIP_HALF_SIZE;
    }

    private createEngineFlame(ship: Node): void {
        const tailZ = this.getTailWorldZ(ship);
        const shipScale = ship.scale.x || 1;
        const flameLocalZ = (tailZ - 20) / shipScale;

        const flameRoot = new Node('EngineFlame');
        flameRoot.setPosition(0, 0, flameLocalZ);
        flameRoot.setScale(1 / shipScale, 1 / shipScale, 1 / shipScale);
        ship.addChild(flameRoot);

        // 参数单位是世界单位（flameRoot 世界缩放为 1），飞船恒为 380 单位，
        // 故尾焰宽度取船体 12%~18%、焰长取 0.7~0.9 倍船体
        this.createFlameEmitter3D(flameRoot, 'FlameCore', {
            maxParticles: 200,
            startLifetime: 0.8,
            startLifetimeVar: 0.3,
            startSpeed: 300,
            startSpeedVar: 90,
            startSize: 45,
            startSizeVar: 15,
            endSizeRatio: 0.15,
            emissionRate: 180,
            coneAngle: 8,
            coneRadius: 8,
            startColor: new Color(230, 245, 255, 255),
            endColor: new Color(80, 150, 255, 0),
        });

        this.createFlameEmitter3D(flameRoot, 'FlameOuter', {
            maxParticles: 250,
            startLifetime: 1.1,
            startLifetimeVar: 0.4,
            startSpeed: 220,
            startSpeedVar: 70,
            startSize: 70,
            startSizeVar: 25,
            endSizeRatio: 0.1,
            emissionRate: 140,
            coneAngle: 18,
            coneRadius: 16,
            startColor: new Color(255, 190, 90, 220),
            endColor: new Color(255, 70, 0, 0),
        });
    }

    private createFlameEmitter3D(parent: Node, name: string, cfg: {
        maxParticles: number;
        startLifetime: number; startLifetimeVar: number;
        startSpeed: number; startSpeedVar: number;
        startSize: number; startSizeVar: number;
        endSizeRatio: number;
        emissionRate: number;
        coneAngle: number;
        coneRadius: number;
        startColor: Color;
        endColor: Color;
    }): void {
        const node = new Node(name);
        // 先加组件、后挂父节点：节点未入活动场景时 onLoad 延迟到挂载时执行，
        // 届时引擎 onLoad 会完成 renderer.onInit（登记已启用的动画模块）、
        // shapeModule.onInit 与 bindModule（bindTarget），保证模块正确绑定
        const ps = node.addComponent(ParticleSystem);

        ps.duration = -1;
        ps.loop = true;
        ps.playOnAwake = true;
        ps.capacity = cfg.maxParticles;

        // CurveRange.Mode: Constant=0, Curve=1, TwoCurves=2, TwoConstants=3
        // constantMin/constantMax 只在 TwoConstants(3) 下生效；误用 1(Curve) 时
        // 实际取默认 spline 的常数 1.0，粒子尺寸/速度/寿命全部变成 1，尾焰不可见
        ps.startLifetime.mode = 3;
        ps.startLifetime.constantMin = cfg.startLifetime;
        ps.startLifetime.constantMax = cfg.startLifetime + cfg.startLifetimeVar;

        ps.startSpeed.mode = 3;
        ps.startSpeed.constantMin = cfg.startSpeed;
        ps.startSpeed.constantMax = cfg.startSpeed + cfg.startSpeedVar;

        ps.startSizeX.mode = 3;
        ps.startSizeX.constantMin = cfg.startSize;
        ps.startSizeX.constantMax = cfg.startSize + cfg.startSizeVar;
        ps.startSizeY.mode = 3;
        ps.startSizeY.constantMin = cfg.startSize;
        ps.startSizeY.constantMax = cfg.startSize + cfg.startSizeVar;
        ps.startSizeZ.mode = 3;
        ps.startSizeZ.constantMin = cfg.startSize;
        ps.startSizeZ.constantMax = cfg.startSize + cfg.startSizeVar;

        ps.startColor.mode = 0;
        ps.startColor.color = cfg.startColor;

        ps.rateOverTime.mode = 0;
        ps.rateOverTime.constant = cfg.emissionRate;

        // 运行时（预览/构建）中模块 getter 返回 null，必须手动 new 并经 setter 赋值；
        // 节点挂载后引擎 onLoad 会完成 onInit / bindTarget 绑定
        const shape = Opening.newParticleModule<FlameShapeModule>('cc.ShapeModule');
        if (shape) {
            shape.shapeType = 2; // Cone
            shape.radius = cfg.coneRadius;
            shape.angle = cfg.coneAngle;
            ps.shapeModule = shape as unknown as typeof ps.shapeModule;
        } else {
            warn('[Opening] cc.ShapeModule not found, flame shape skipped');
        }

        const color = Opening.newParticleModule<FlameColorModule>('cc.ColorOvertimeModule');
        if (color) {
            color.enable = true;
            color.color.mode = 1;
            const gradient = new Gradient();
            const c0: any = { color: cfg.startColor.clone(), time: 0 };
            const c1: any = { color: cfg.endColor.clone(), time: 1 };
            const a0: any = { alpha: cfg.startColor.a / 255, time: 0 };
            const a1: any = { alpha: cfg.endColor.a / 255, time: 1 };
            gradient.setKeys([c0, c1], [a0, a1]);
            color.color.gradient = gradient;
            ps.colorOverLifetimeModule = color as unknown as typeof ps.colorOverLifetimeModule;
        } else {
            warn('[Opening] cc.ColorOvertimeModule not found, flame color skipped');
        }

        const size = Opening.newParticleModule<FlameSizeModule>('cc.SizeOvertimeModule');
        if (size) {
            size.enable = true;
            size.size.mode = 0;
            size.size.constant = cfg.endSizeRatio;
            ps.sizeOvertimeModule = size as unknown as typeof ps.sizeOvertimeModule;
        } else {
            warn('[Opening] cc.SizeOvertimeModule not found, flame size skipped');
        }

        ps.renderer.renderMode = 1;
        ps.renderer.velocityScale = 0.5;
        ps.renderer.lengthScale = 1.5;

        // renderer.mainTexture 的 setter 是无效操作（_mainTexture 从不被渲染器读取），
        // 贴图必须挂在材质的 mainTexture 属性上；材质需在 onLoad 前挂好
        const mat = Opening.getFlameMaterial();
        if (mat) {
            ps.setSharedMaterial(mat, 0);
        }

        parent.addChild(node);
        ps.play();
        warn('[Opening] createFlameEmitter3D', name, 'mat=', !!mat);
    }

    /** 按 ccclass 注册名构造引擎内部粒子模块实例（3.8 运行时模块 getter 不自建实例） */
    private static newParticleModule<T>(className: string): T | null {
        const ctor = js.getClassByName(className) as (new () => T) | undefined;
        return ctor ? new ctor() : null;
    }

    private static _flameMaterial: Material | null = null;

    /**
     * 复制内置默认粒子材质并换上辉光贴图（两个发射器共用一份）。
     * 渲染器实际从 sharedMaterial 的 mainTexture 属性读贴图，
     * 不设则用内置 grey 纯色方块，尾焰会是一堆灰方块。
     */
    private static getFlameMaterial(): Material | null {
        if (this._flameMaterial) return this._flameMaterial;
        const frame = this.getGlowFrame();
        const proto = builtinResMgr.get<Material>('default-particle-material');
        if (!frame || !proto) return null;
        const mat = new Material();
        mat.copy(proto);
        mat.setProperty('mainTexture', frame.texture);
        this._flameMaterial = mat;
        return mat;
    }

    private static _glowFrame: SpriteFrame | null = null;

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