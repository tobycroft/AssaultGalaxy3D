import { _decorator, Component, Node, Vec3, tween, assetManager, Prefab, instantiate, geometry, MeshRenderer, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_PREFAB_UUID = '47c67489-b792-4bb0-b34a-98df349e2bcf@f579f';
const TARGET_SHIP_SIZE = 100;
const DOLLY_FAR = 500;
const DOLLY_NEAR = 50;
const DOLLY_DURATION = 3.0;
const ORBIT_DURATION = 4.0;
const ORBIT_EASING = 'cubicInOut';

@ccclass('Opening')
export class Opening extends Component {

    private cameraRig: Node | null = null;
    private cameraNode: Node | null = null;

    onLoad(): void {
        this.findCameraNodes();
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

    private loadShip(): void {
        assetManager.loadAny({ uuid: SHIP_PREFAB_UUID }, (err, prefab) => {
            if (err || !prefab) {
                warn('[Opening] Failed to load ship model:', err);
                return;
            }
            const ship = instantiate(prefab as Prefab);
            ship.setPosition(0, 0, 0);
            this.node.addChild(ship);
            this.scheduleOnce(() => {
                this.fitShip(ship);
                this.startCameraAnimation();
            }, 0);
        });
    }

    private fitShip(ship: Node): void {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const aabb = new geometry.AABB();
        const renderers = ship.getComponentsInChildren(MeshRenderer);
        for (const r of renderers) {
            const m = r.model;
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
        if (!isFinite(minX)) {
            warn('[Opening] No mesh bounds found for ship model');
            return;
        }

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = TARGET_SHIP_SIZE / maxDim;

        ship.setScale(scale, scale, scale);
        ship.setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
    }

    private startCameraAnimation(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        this.cameraRig.setPosition(0, 0, 0);
        this.cameraRig.setRotationFromEuler(0, 0, 0);
        this.cameraNode.setPosition(0, 0, DOLLY_FAR);

        const camPos = this.cameraNode.position.clone();
        camPos.z = DOLLY_NEAR;

        tween(this.cameraNode)
            .to(DOLLY_DURATION, { position: camPos }, { easing: 'cubicInOut' })
            .call(() => {
                this.startOrbit();
            })
            .start();
    }

    private startOrbit(): void {
        if (!this.cameraRig) return;

        const targetEuler = new Vec3(0, 360, 0);

        tween(this.cameraRig)
            .to(ORBIT_DURATION, { eulerAngles: targetEuler }, { easing: ORBIT_EASING })
            .start();
    }
}