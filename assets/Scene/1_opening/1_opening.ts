import { _decorator, Component, Node, Vec3, tween, assetManager, Prefab, instantiate, geometry, MeshRenderer, warn } from 'cc';

const { ccclass } = _decorator;

const SHIP_PREFAB_UUID = '47c67489-b792-4bb0-b34a-98df349e2bcf@f579f';
const TARGET_SHIP_SIZE = 380;

// 动画参数
const DOLLY_DURATION = 4.0;
const ORBIT_DURATION = 5.0;
const FINAL_DURATION = 2.5;
const ORBIT_EASING = 'cubicInOut';

// 飞船半径（用于计算相机安全距离，确保始终在飞船外部）
const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;
const SAFE_MARGIN = 100;

// 相机关键位置 z 值（确保 z > SHIP_HALF_SIZE + SAFE_MARGIN）
const Z_DEEP_SPACE = SHIP_HALF_SIZE * 6;       // 深空远处
const Z_APPROACH = SHIP_HALF_SIZE * 1.8;       // 靠近飞船外部
const Z_TAIL = SHIP_HALF_SIZE * 1.2;           // 最终：飞船尾部外部

@ccclass('Opening')
export class Opening extends Component {

    private cameraRig: Node | null = null;
    private cameraNode: Node | null = null;
    private fitRetryCount = 0;

    onLoad(): void {
        this.findCameraNodes();
        // 立即把相机放到深空位置，避免模型加载期间看到默认位置造成的跳动
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
        assetManager.loadAny({ uuid: SHIP_PREFAB_UUID }, (err, prefab) => {
            if (err || !prefab) {
                warn('[Opening] Failed to load ship model:', err);
                return;
            }
            const ship = instantiate(prefab as Prefab);
            ship.setPosition(0, 0, 0);
            this.node.addChild(ship);
            this.fitShipWithRetry(ship);
        });
    }

    /**
     * 尝试 fitShip，如果 modelBounds 尚未就绪则延迟重试（最多 10 帧）。
     * 这是修复"相机在飞船内部"的关键：必须确保飞船被正确缩放到目标尺寸后再启动动画。
     */
    private fitShipWithRetry(ship: Node): void {
        if (this.fitShip(ship)) {
            this.startCameraAnimation();
        } else {
            this.fitRetryCount++;
            if (this.fitRetryCount > 10) {
                warn('[Opening] fitShip failed after retries, using fallback scale');
                // 兜底：直接按目标尺寸缩放，假设模型原点在中心
                ship.setScale(TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10, TARGET_SHIP_SIZE / 10);
                ship.setPosition(0, 0, 0);
                this.startCameraAnimation();
                return;
            }
            this.scheduleOnce(() => this.fitShipWithRetry(ship), 0.1);
        }
    }

    /** 根据包围盒自动缩放并居中。返回 true 表示成功，false 表示 bounds 尚未就绪。 */
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

    /**
     * 三段式运镜：
     * 1. 深空远处 → 由远及近飞到飞船尾部外部（飞船始终在画面中部偏下）
     * 2. 靠近后绕飞船 360° 环绕
     * 3. 环绕结束后聚焦到飞船尾部第三人称视角
     */
    private startCameraAnimation(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        // 确保从深空位置开始
        this.setCameraToDeepSpace();

        const startPos = new Vec3(0, SHIP_HALF_SIZE, Z_DEEP_SPACE);
        const endPos = new Vec3(0, SHIP_HALF_SIZE * 0.3, Z_APPROACH);

        this.tweenCameraTo(startPos, endPos, DOLLY_DURATION, () => {
            this.startOrbit();
        });
    }

    /** 阶段二：绕飞船 360° 环绕，相机始终注视飞船 */
    private startOrbit(): void {
        if (!this.cameraRig || !this.cameraNode) return;

        // 环绕时相机保持在 Z_APPROACH 距离，绕 Y 轴旋转
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

    /** 阶段三：聚焦到飞船尾部第三人称视角 */
    private finalPosition(): void {
        if (!this.cameraNode) return;

        const currentPos = this.cameraNode.position.clone();
        const endPos = new Vec3(0, SHIP_HALF_SIZE * 0.15, Z_TAIL);
        this.tweenCameraTo(currentPos, endPos, FINAL_DURATION);
    }

    /** 辅助：tween 相机从 startPos 到 endPos，过程中保持 lookAt 原点 */
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