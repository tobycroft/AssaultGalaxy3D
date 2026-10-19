import { _decorator, Component, Node, Vec3, Vec2, Color, tween, resources, Prefab, instantiate, geometry, MeshRenderer, ParticleSystem2D, UITransform, SpriteFrame, Texture2D, Rect, assetManager, gfx, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_DIR = 'Model/spaceship';
const TARGET_SHIP_SIZE = 380;

const DOLLY_DURATION = 12.0;
const ORBIT_EASING = 'cubicInOut';

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;

const Z_DEEP_SPACE = SHIP_HALF_SIZE * 100;
const Z_TAIL = SHIP_HALF_SIZE * 2.4;

const DEFAULT_SPRITE_UUID = '20835ba4-6145-4fbc-a58a-051ce700aa3e';

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
        this.cameraNode.setPosition(0, Z_DEEP_SPACE, Z_DEEP_SPACE);
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
        this.cameraNode.setPosition(0, Z_DEEP_SPACE, Z_DEEP_SPACE);
        this.cameraNode.lookAt(Vec3.ZERO);

        const startY = Z_DEEP_SPACE;
        const endY = Z_TAIL;
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

        const flameRoot = new Node('EngineFlame');
        flameRoot.layer = ship.layer;
        flameRoot.setPosition(0, 0, tailZ / shipScale);
        flameRoot.setRotationFromEuler(-90, 0, 0);
        flameRoot.setScale(1 / shipScale, 1 / shipScale, 1 / shipScale);
        ship.addChild(flameRoot);

        this.spawnFlameEmitter('FlameCore', flameRoot, {
            totalParticles: 200,
            life: 0.8,
            lifeVar: 0.3,
            startSize: 60,
            startSizeVar: 20,
            endSize: 15,
            endSizeVar: 8,
            speed: 500,
            speedVar: 200,
            angle: 90,
            angleVar: 12,
            emissionRate: 220,
            startColor: new Color(200, 230, 255, 255),
            startColorVar: new Color(40, 20, 0, 0),
            endColor: new Color(100, 160, 255, 0),
            endColorVar: new Color(0, 0, 0, 0),
        });

        this.spawnFlameEmitter('FlameOuter', flameRoot, {
            totalParticles: 300,
            life: 1.1,
            lifeVar: 0.4,
            startSize: 110,
            startSizeVar: 40,
            endSize: 30,
            endSizeVar: 15,
            speed: 380,
            speedVar: 150,
            angle: 90,
            angleVar: 35,
            emissionRate: 180,
            startColor: new Color(255, 160, 60, 220),
            startColorVar: new Color(30, 30, 0, 0),
            endColor: new Color(255, 80, 0, 0),
            endColorVar: new Color(0, 0, 0, 0),
        });
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
        n.layer = parent.layer;
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

        const blend = ps as unknown as { srcBlendFactor: number; dstBlendFactor: number };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;

        parent.addChild(n);

        assetManager.loadAny({ uuid: DEFAULT_SPRITE_UUID }, (err, img) => {
            if (err || !img || !n.isValid) return;
            const tex = new Texture2D();
            tex.image = img as any;
            const sf = new SpriteFrame();
            sf.texture = tex;
            sf.rect = new Rect(0, 0, tex.width, tex.height);
            sf.packable = false;
            ps.spriteFrame = sf;
            ps.resetSystem();
        });
    }
}