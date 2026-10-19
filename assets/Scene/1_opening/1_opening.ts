import { _decorator, Component, Node, Vec3, tween, resources, Prefab, instantiate, geometry, MeshRenderer, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_DIR = 'Model/spaceship';
const TARGET_SHIP_SIZE = 380;

const DOLLY_DURATION = 4.0;
const ORBIT_DURATION = 5.0;
const FINAL_DURATION = 2.5;
const ORBIT_EASING = 'cubicInOut';

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;

const Z_DEEP_SPACE = SHIP_HALF_SIZE * 6;
const Z_APPROACH = SHIP_HALF_SIZE * 1.8;
const Z_TAIL = SHIP_HALF_SIZE * 1.2;

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
        this.cameraNode.setPosition(0, SHIP_HALF_SIZE, Z_DEEP_SPACE);
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

    private fitShipWithRetry(ship: Node): void {
        if (this.fitShip(ship)) {
            this.startCameraAnimation();
        } else {
            this.fitRetryCount++;
            if (this.fitRetryCount > 10) {
                warn('[Opening] fitShip failed after retries, using fallback scale');
                ship.setScale(TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10);
                ship.setPosition(0, 0, 0);
                this.startCameraAnimation();
                return;
            }
            this.scheduleOnce(() => this.fitShipWithRetry(ship), 0.1);
        }
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

        this.setCameraToDeepSpace();

        const startPos = new Vec3(0, SHIP_HALF_SIZE, Z_DEEP_SPACE);
        const endPos = new Vec3(0, SHIP_HALF_SIZE * 0.3, Z_APPROACH);

        this.tweenCameraTo(startPos, endPos, DOLLY_DURATION, () => {
            this.startOrbit();
        });
    }

    private startOrbit(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        this.cameraNode.setPosition(0, SHIP_HALF_SIZE * 0.3, Z_APPROACH);
        this.cameraNode.lookAt(Vec3.ZERO);

        tween(this.cameraRig)
            .to(ORBIT_DURATION, { eulerAngles: new Vec3(0, 360, 0) }, {
                easing: ORBIT_EASING,
                onUpdate: () => {
                    this.cameraNode!.lookAt(Vec3.ZERO);
                },
            })
            .call(() => this.finalPosition())
            .start();
    }

    private finalPosition(): void {
        if (!this.cameraNode) return;

        const currentPos = this.cameraNode.position.clone();
        const endPos = new Vec3(0, SHIP_HALF_SIZE * 0.15, Z_TAIL);
        this.tweenCameraTo(currentPos, endPos, FINAL_DURATION);
    }

    private tweenCameraTo(startPos: Vec3, endPos: Vec3, duration: number, onComplete?: () => void): void {
        if (!this.cameraNode) return;

        this.cameraNode.setPosition(startPos);
        this.cameraNode.lookAt(Vec3.ZERO);

        const tw = tween(this.cameraNode)
            .to(duration, { position: endPos.clone() }, {
                easing: ORBIT_EASING,
                onUpdate: () => {
                    this.cameraNode!.lookAt(Vec3.ZERO);
                },
            });

        if (onComplete) {
            tw.call(onComplete);
        }
        tw.start();
    }
}