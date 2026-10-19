import { _decorator, Component, Node, Vec3, tween, resources, Prefab, instantiate, warn, geometry, MeshRenderer } from 'cc';

const { ccclass } = _decorator;

const SHIP_PATH = 'Model/spaceship/default_hq';
/** 飞船适配尺寸（世界单位，同 Hangar）：加载后按包围盒缩放到该大小并居中到原点，环绕以原点为心 */
const TARGET_SHIP_SIZE = 380;
/** 推近终点距离：大于飞船尺寸即保证相机停在飞船外部（fov 45 下飞船约占画面七成） */
const DOLLY_NEAR = 640;
/** 起始距离：很远，实现由远及近 */
const DOLLY_FAR = 2600;
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
        resources.load(SHIP_PATH, Prefab, (err, prefab) => {
            if (err || !prefab) {
                warn('[Opening] Failed to load ship model:', err);
                return;
            }
            const ship = instantiate(prefab);
            this.node.addChild(ship);
            // 包围盒适配延迟一帧（渲染 Model 的世界矩阵需管线更新后才有，同 Hangar.fitShip）
            this.scheduleOnce(() => this.fitShip(ship), 0);
            this.startCameraAnimation();
        });
    }

    /**
     * 包围盒适配：按最大边缩放到 TARGET_SHIP_SIZE 并居中到原点。
     * 不缩放的话相机（几百单位外）会停在飞船内部，且环绕心不在船体中心。
     */
    private fitShip(ship: Node): void {
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

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
            maxY = Math.max(maxY, c.y - h.y);
            minZ = Math.min(minZ, c.z - h.z);
            maxZ = Math.max(maxZ, c.z + h.z);
        }
        if (!isFinite(minX)) return;

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = TARGET_SHIP_SIZE / maxDim;
        const localCenter = ship.parent!.inverseTransformPoint(new Vec3(), center);
        ship.setScale(scale, scale, scale);
        ship.setPosition(-localCenter.x * scale, -localCenter.y * scale, -localCenter.z * scale);
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
