import { _decorator, Component, Node, Vec3, Color, tween, resources, Prefab, instantiate, geometry, MeshRenderer, ParticleSystem, Gradient, SpriteFrame, Texture2D, ImageAsset, Rect, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_DIR = 'Model/spaceship';
const TARGET_SHIP_SIZE = 380;

const DOLLY_DURATION = 12.0;
const ORBIT_EASING = 'cubicInOut';

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;

const Z_DEEP_SPACE = SHIP_HALF_SIZE * 100;
const Z_TAIL = SHIP_HALF_SIZE * 2.4;

const ANGLE_TAN = Math.tan(15 * Math.PI / 180);

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

        this.createFlameEmitter3D(flameRoot, 'FlameCore', {
            maxParticles: 200,
            startLifetime: 0.8,
            startLifetimeVar: 0.3,
            startSpeed: 25,
            startSpeedVar: 8,
            startSize: 1.8,
            startSizeVar: 0.6,
            endSizeRatio: 0.15,
            emissionRate: 180,
            coneAngle: 8,
            coneRadius: 0.15,
            startColor: new Color(230, 245, 255, 255),
            endColor: new Color(80, 150, 255, 0),
        });

        this.createFlameEmitter3D(flameRoot, 'FlameOuter', {
            maxParticles: 250,
            startLifetime: 1.1,
            startLifetimeVar: 0.4,
            startSpeed: 18,
            startSpeedVar: 6,
            startSize: 3.0,
            startSizeVar: 1.0,
            endSizeRatio: 0.1,
            emissionRate: 140,
            coneAngle: 18,
            coneRadius: 0.25,
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
        parent.addChild(node);

        const ps = node.addComponent(ParticleSystem);

        ps.duration = -1;
        ps.loop = true;
        ps.playOnAwake = true;
        ps.capacity = cfg.maxParticles;

        ps.startLifetime.mode = 1;
        ps.startLifetime.constantMin = cfg.startLifetime;
        ps.startLifetime.constantMax = cfg.startLifetime + cfg.startLifetimeVar;

        ps.startSpeed.mode = 1;
        ps.startSpeed.constantMin = cfg.startSpeed;
        ps.startSpeed.constantMax = cfg.startSpeed + cfg.startSpeedVar;

        ps.startSizeX.mode = 1;
        ps.startSizeX.constantMin = cfg.startSize;
        ps.startSizeX.constantMax = cfg.startSize + cfg.startSizeVar;
        ps.startSizeY.mode = 1;
        ps.startSizeY.constantMin = cfg.startSize;
        ps.startSizeY.constantMax = cfg.startSize + cfg.startSizeVar;
        ps.startSizeZ.mode = 1;
        ps.startSizeZ.constantMin = cfg.startSize;
        ps.startSizeZ.constantMax = cfg.startSize + cfg.startSizeVar;

        ps.startColor.mode = 0;
        ps.startColor.color = cfg.startColor;

        ps.rateOverTime.mode = 0;
        ps.rateOverTime.constant = cfg.emissionRate;

        ps.shapeModule.shapeType = 2;
        ps.shapeModule.radius = cfg.coneRadius;
        ps.shapeModule.angle = cfg.coneAngle;

        ps.colorOverLifetimeModule.enable = true;
        ps.colorOverLifetimeModule.color.mode = 1;
        const gradient = new Gradient();
        const c0: any = { color: cfg.startColor.clone(), time: 0 };
        const c1: any = { color: cfg.endColor.clone(), time: 1 };
        const a0: any = { alpha: cfg.startColor.a / 255, time: 0 };
        const a1: any = { alpha: cfg.endColor.a / 255, time: 1 };
        gradient.setKeys([c0, c1], [a0, a1]);
        ps.colorOverLifetimeModule.color.gradient = gradient;

        ps.sizeOvertimeModule.enable = true;
        ps.sizeOvertimeModule.size.mode = 0;
        ps.sizeOvertimeModule.size.constant = cfg.endSizeRatio;

        ps.renderer.renderMode = 1;
        ps.renderer.velocityScale = 0.5;
        ps.renderer.lengthScale = 1.5;

        const frame = Opening.getGlowFrame();
        if (frame) {
            ps.renderer.mainTexture = frame.texture as Texture2D;
        }

        ps.play();
        warn('[Opening] createFlameEmitter3D', name, 'frame=', !!frame);
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