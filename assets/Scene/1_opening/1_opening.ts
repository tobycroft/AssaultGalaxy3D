import { _decorator, Component, Node, Vec3, Quat, tween, assetManager, Prefab, instantiate, geometry, MeshRenderer, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_PREFAB_UUID = '47c67489-b792-4bb0-b34a-98df349e2bcf@f579f';
const TARGET_SHIP_SIZE = 100;

// 动画参数
const DOLLY_DURATION = 4.0;
const ORBIT_DURATION = 5.0;
const FINAL_DURATION = 2.5;
const ORBIT_EASING = 'cubicInOut';

// 相机关键位置（相对于 CameraRig，即世界空间）
const POS_DEEP_SPACE = new Vec3(0, 120, 800);    // 深空远处，飞船在画面中部偏下
const POS_APPROACH = new Vec3(0, 40, 220);       // 靠近飞船外部，尾部方向
const POS_TAIL = new Vec3(0, 15, 140);           // 最终：飞船尾部外部第三人称视角

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

    /**
     * 三段式运镜：
     * 1. 深空远处 → 由远及近飞到飞船尾部外部（飞船始终在画面中部偏下）
     * 2. 靠近后绕飞船 360° 环绕
     * 3. 环绕结束后聚焦到飞船尾部第三人称视角
     */
    private startCameraAnimation(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        // 重置 rig
        this.cameraRig.setPosition(0, 0, 0);
        this.cameraRig.setRotationFromEuler(0, 0, 0);

        // 起始：深空远处，相机看向飞船
        this.setCameraLookAt(POS_DEEP_SPACE, Vec3.ZERO);

        // 阶段一：从深空由远及近飞到飞船尾部外部
        this.tweenCameraTo(POS_DEEP_SPACE, POS_APPROACH, DOLLY_DURATION, () => {
            this.startOrbit();
        });
    }

    /** 阶段二：绕飞船 360° 环绕，相机始终注视飞船 */
    private startOrbit(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        tween(this.cameraRig)
            .to(ORBIT_DURATION, { eulerAngles: new Vec3(0, 360, 0) }, {
                easing: ORBIT_EASING,
                onUpdate: () => {
                    // rig 旋转时，相机保持相对位置，但需要重新看向原点
                    this.cameraNode!.lookAt(Vec3.ZERO);
                },
            })
            .call(() => this.finalPosition())
            .start();
    }

    /** 阶段三：聚焦到飞船尾部第三人称视角 */
    private finalPosition(): void {
        if (!this.cameraNode) return;

        // rig 已转完 360°（等同于 0°），相机从当前位置移到尾部外部
        this.tweenCameraTo(this.cameraNode.position.clone(), POS_TAIL, FINAL_DURATION);
    }

    /** 辅助：设置相机位置和朝向（lookAt） */
    private setCameraLookAt(pos: Vec3, target: Vec3): void {
        if (!this.cameraNode) return;
        this.cameraNode.setPosition(pos);
        this.cameraNode.lookAt(target);
    }

    /** 辅助：tween 相机从 startPos 到 endPos，过程中保持 lookAt 原点 */
    private tweenCameraTo(startPos: Vec3, endPos: Vec3, duration: number, onComplete?: () => void): void {
        if (!this.cameraNode) return;

        // 先设置到起始位置
        this.cameraNode.setPosition(startPos);
        this.cameraNode.lookAt(Vec3.ZERO);

        const tw = tween(this.cameraNode)
            .to(duration, { position: endPos.clone() }, {
                easing: ORBIT_EASING,
                onUpdate: () => {
                    // tween 每帧更新位置后，重新计算朝向
                    this.cameraNode!.lookAt(Vec3.ZERO);
                },
            });

        if (onComplete) {
            tw.call(onComplete);
        }
        tw.start();
    }
}