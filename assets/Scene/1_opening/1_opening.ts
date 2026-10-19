import { _decorator, Component, Node, Vec3, Vec2, Color, tween, resources, Prefab, instantiate, geometry, MeshRenderer, ParticleSystem2D, UITransform, SpriteFrame, Texture2D, ImageAsset, Rect, Canvas, gfx, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_DIR = 'Model/spaceship';
const TARGET_SHIP_SIZE = 380;

const DOLLY_DURATION = 12.0;
const ORBIT_EASING = 'cubicInOut';

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;

const Z_DEEP_SPACE = SHIP_HALF_SIZE * 100;
const Z_TAIL = SHIP_HALF_SIZE * 2.4;

const ANGLE_TAN = Math.tan(15 * Math.PI / 180);
const UI_LAYER = 33554432;

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
        flameRoot.layer = UI_LAYER;
        flameRoot.setPosition(0, 0, flameLocalZ);
        flameRoot.setScale(1 / shipScale, 1 / shipScale, 1 / shipScale);
        ship.addChild(flameRoot);

        const canvas = flameRoot.addComponent(Canvas);

        const crossAngles = [0, 60, 120];
        for (const rotY of crossAngles) {
            const slice = new Node('FlameSlice_' + rotY);
            slice.layer = UI_LAYER;
            slice.setRotationFromEuler(-90, rotY, 0);
            flameRoot.addChild(slice);

            this.spawnFlameEmitter('Core_' + rotY, slice, {
                totalParticles: 120,
                life: 0.8,
                lifeVar: 0.3,
                startSize: 60,
                startSizeVar: 20,
                endSize: 15,
                endSizeVar: 8,
                speed: 280,
                speedVar: 80,
                angle: 270,
                angleVar: 12,
                emissionRate: 150,
                startColor: new Color(220, 240, 255, 255),
                startColorVar: new Color(30, 15, 0, 0),
                endColor: new Color(100, 160, 255, 0),
                endColorVar: new Color(0, 0, 0, 0),
            });

            this.spawnFlameEmitter('Outer_' + rotY, slice, {
                totalParticles: 160,
                life: 1.1,
                lifeVar: 0.4,
                startSize: 90,
                startSizeVar: 30,
                endSize: 25,
                endSizeVar: 12,
                speed: 200,
                speedVar: 60,
                angle: 270,
                angleVar: 25,
                emissionRate: 120,
                startColor: new Color(255, 180, 80, 220),
                startColorVar: new Color(30, 30, 0, 0),
                endColor: new Color(255, 80, 0, 0),
                endColorVar: new Color(0, 0, 0, 0),
            });
        }
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

    private spawnFlameEmitter(name: string, parent: Node, cfg: {
        totalParticles: number;
        life: number; lifeVar: number;
        startSize: number; startSizeVar: number;
        endSize: number; endSizeVar: number;
        speed: number; speedVar: number;
        angle: number; angleVar: number;
        emissionRate: number;
        startColor: Color; startColorVar: Color;
        endColor: Color; endColorVar: Color;
    }): void {
        const n = new Node(name);
        n.layer = UI_LAYER;
        n.addComponent(UITransform).setContentSize(10, 10);

        const ps = n.addComponent(ParticleSystem2D);
        ps.custom = true;
        ps.playOnLoad = false;
        ps.totalParticles = cfg.totalParticles;
        ps.duration = -1;
        ps.life = cfg.life;
        ps.lifeVar = cfg.lifeVar;
        ps.startSize = cfg.startSize;
        ps.startSizeVar = cfg.startSizeVar;
        ps.endSize = cfg.endSize;
        ps.endSizeVar = cfg.endSizeVar;
        ps.speed = cfg.speed;
        ps.speedVar = cfg.speedVar;
        ps.angle = cfg.angle;
        ps.angleVar = cfg.angleVar;
        ps.gravity = new Vec2(0, 0);
        ps.emissionRate = cfg.emissionRate;
        ps.positionType = 0;
        ps.startColor = cfg.startColor;
        ps.startColorVar = cfg.startColorVar;
        ps.endColor = cfg.endColor;
        ps.endColorVar = cfg.endColorVar;

        const blend = ps as unknown as { srcBlendFactor: number; dstBlendFactor: number; depthTest: boolean; depthWrite: boolean };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;
        blend.depthTest = false;
        blend.depthWrite = false;

        parent.addChild(n);

        const frame = Opening.getGlowFrame();
        ps.spriteFrame = frame;
        ps.resetSystem();
        warn('[Opening] spawnFlameEmitter', name, 'frame=', !!frame, 'node=', n.isValid);
    }
}