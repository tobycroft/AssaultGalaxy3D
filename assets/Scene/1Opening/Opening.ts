import {
    _decorator,
    Component,
    director,
    Node,
    resources,
    Prefab,
    instantiate,
    Vec3,
    Vec4,
    Quat,
    Color,
    UITransform,
    Label,
    MeshRenderer,
    DirectionalLight,
    Camera,
    geometry,
} from 'cc';
import { TechText } from '../../Common/TechUI';
import { ExitOnBack } from '../../Common/ExitOnBack';
import { SpaceSkybox } from '../../Space/SpaceSkybox';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1）
const MODEL_LAYER = 1;

/** 主角飞船统一缩放到的大致尺寸（世界单位） */
const SHIP_SIZE = 300;
/** 太空站缩放尺寸（远景地标，比飞船大） */
const STATION_SIZE = 900;
/** 太空站在场景中的位置（远景前侧方，越过船头的背景地标） */
const STATION_POS = new Vec3(-1400, 500, 2600);

/**
 * 相机运镜：起点（飞船后方很远）/ 终点（船尾特写）。
 * 飞船适配后机尾在 z≈-150、机头在 z≈+150（长轴沿 Z，尖头 +Z 为机头），
 * 起终点都在船尾侧（-Z），镜头从后方远处一路追近、最终停在船尾发动机前。
 */
const CAM_START = new Vec3(700, 420, -2400);
const CAM_END = new Vec3(80, 130, -450);
/** 相机运镜时长（秒）与缓动 */
const DOLLY_DURATION = 6;
/** 飞船漂浮幅度与频率（世界单位 / 弧度每秒） */
const SHIP_BOB_AMP = 12;
const SHIP_BOB_OMEGA = 0.6;

/**
 * 开场第一幕（1Opening）：游戏启动后的 3D 开场镜头。
 * 画面内容：太空中的主角飞船（缓慢上下漂浮，呈飞行姿态）与远景太空站，
 * 背景为宇宙天空盒（SpaceSkybox，默认星系）。
 * 镜头动画：透视相机从飞船后方很远处经 6 秒缓动（sineInOut）追近，
 * 最终停在船尾发动机特写；全程注视飞船；模型异步加载完成后才开始运镜。
 * 组件挂 Canvas（与 Debug / Hangar 一致），Camera / 模型 / 灯光挂场景根。
 */
@ccclass('Opening')
export class Opening extends Component {
    /** 运镜透视相机（3D 模型层 + 天空盒；UI 由场景自带正交相机叠加） */
    private camNode: Node | null = null;
    /** 主角飞船节点（未加载完为 null） */
    private ship: Node | null = null;
    /** 飞船漂浮基准位置（加载适配后记录） */
    private shipBase = new Vec3(0, 0, 0);
    /** 太空站节点 */
    private station: Node | null = null;
    /** 场景计时（秒） */
    private elapsed = 0;
    /** 相机运镜进度（秒）：0~DOLLY_DURATION 推近中，>= DOLLY_DURATION 已到位；-1 未开始 */
    private dollyT = -1;
    /** 状态栏 Label */
    private statusLabel: Label | null = null;

    onLoad(): void {
        this.addLights();
        this.setupCamera();
        // 宇宙背景（默认星系天空盒，与 Debug 宇宙预览/ Hangar 同一套组件）
        this.node.addComponent(SpaceSkybox);
        this.buildStatus();
        this.loadActors();
        // 游戏内退出监听（与 Hangar 一致）：ESC / Android 返回键弹出退出菜单
        this.node.addComponent(ExitOnBack);
    }

    update(dt: number): void {
        this.elapsed += dt;
        if (!this.camNode) return;

        // 飞船漂浮（上下正弦），模拟太空巡航姿态（加载失败时跳过，不影响运镜）；
        // 不做自旋——运镜终点停在船尾特写，自旋会把船尾转离镜头
        if (this.ship) {
            this.ship.setPosition(this.shipBase.x, this.shipBase.y + Math.sin(this.elapsed * SHIP_BOB_OMEGA) * SHIP_BOB_AMP, this.shipBase.z);
        }

        // 太空站缓速自旋
        if (this.station) {
            this.station.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UP, 0.05 * dt));
        }

        // 相机运镜：从远景起点手动插值推近到终点（sineInOut），避免依赖 tween 对
        // Node.position 的补间行为；朝向由下方 lookAt 每帧维持
        if (this.dollyT >= 0 && this.dollyT < DOLLY_DURATION) {
            this.dollyT = Math.min(DOLLY_DURATION, this.dollyT + dt);
            const k = this.dollyT / DOLLY_DURATION;
            const e = 0.5 - 0.5 * Math.cos(Math.PI * k); // sineInOut
            this.camNode.setPosition(
                CAM_START.x + (CAM_END.x - CAM_START.x) * e,
                CAM_START.y + (CAM_END.y - CAM_START.y) * e,
                CAM_START.z + (CAM_END.z - CAM_START.z) * e,
            );
        }

        // 相机全程注视飞船（运镜推近过程中保持构图；飞船缺失时注视原点）
        this.camNode.lookAt(this.ship ? this.ship.worldPosition : Vec3.ZERO);
    }

    /**
     * 双相机分工（与 Debug 宇宙预览同一套已验证方案）：
     * - 运镜透视相机：天空盒只在透视相机下渲染，clearFlags 必须为 SKYBOX（SOLID_COLOR
     *   会把宇宙背景清成纯色），visibility 仅 3D 模型层，放置到远景起点；
     * - 场景自带正交相机：保留并改为只画 UI_2D 层、DONT_CLEAR 不清屏、priority 1 后画，
     *   把状态字叠加在 3D 画面之上（UI_2D 层在透视相机下无法正常渲染）。
     */
    private setupCamera(): void {
        const uiCam = this.node.scene.getChildByName('Camera')?.getComponent(Camera) ?? null;
        if (uiCam) {
            uiCam.visibility = UI_LAYER;
            uiCam.clearFlags = Camera.ClearFlag.DONT_CLEAR;
            uiCam.priority = 1;
        }

        const camNode = new Node('OpeningCamera');
        camNode.layer = MODEL_LAYER;
        camNode.setPosition(CAM_START);
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.PERSPECTIVE;
        cam.fov = 45;
        cam.near = 1;
        cam.far = 12000;
        cam.clearFlags = Camera.ClearFlag.SKYBOX;
        cam.visibility = MODEL_LAYER;
        this.node.scene.addChild(camNode);
        this.camNode = camNode;
    }

    /** 底部状态字（科技风小字） */
    private buildStatus(): void {
        const status = new Node('StatusLabel');
        status.layer = UI_LAYER;
        status.setPosition(0, -310, 0);
        status.addComponent(UITransform).setContentSize(900, 32);
        const l = status.addComponent(Label);
        l.string = '正在进入深空…';
        l.fontSize = 22;
        l.color = TechText.caption;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(status);
        this.statusLabel = l;
    }

    /** 异步加载飞船与太空站，全部就位后开始运镜 */
    private loadActors(): void {
        let pending = 2;
        const onOne = (): void => {
            pending--;
            if (pending > 0) return;
            this.setStatus('第一章 · 深空前线');
            this.startCameraDolly();
        };
        resources.load('Model/spaceship/default_hq', Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.setStatus('飞船模型加载失败：Model/spaceship/default_hq');
                onOne();
                return;
            }
            this.spawnShip(prefab);
            onOne();
        });
        resources.load('Model/spacestation/spacestation_tiangong2', Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.setStatus('太空站模型加载失败：Model/spacestation/spacestation_tiangong2');
                onOne();
                return;
            }
            this.spawnStation(prefab);
            onOne();
        });
    }

    /** 飞船：原点附近，包围盒适配到 SHIP_SIZE */
    private spawnShip(prefab: Prefab): void {
        const ship = instantiate(prefab);
        ship.layer = MODEL_LAYER;
        this.node.scene.addChild(ship);
        this.ship = ship;
        // 包围盒适配延迟一帧（渲染 Model 的世界矩阵需管线更新后才有，同 Hangar.fitShip）；
        // 适配后飞船视觉中心位于原点，以适配后的位置作为漂浮基准
        this.scheduleOnce(() => {
            if (!this.ship) return;
            this.fitToTarget(this.ship);
            this.shipBase = this.ship.position.clone();
        }, 0);
    }

    /** 太空站：远景地标，包围盒适配到 STATION_SIZE */
    private spawnStation(prefab: Prefab): void {
        const station = instantiate(prefab);
        station.layer = MODEL_LAYER;
        this.node.scene.addChild(station);
        this.station = station;
        this.scheduleOnce(() => {
            if (!this.station) return;
            this.fitToTarget(this.station, STATION_SIZE);
            this.station.setPosition(STATION_POS);
        }, 0);
    }

    /**
     * 启动相机运镜：把相机放回远景起点并清零运镜进度，
     * 实际推近由 update 手动插值完成（sineInOut，时长 DOLLY_DURATION）。
     */
    private startCameraDolly(): void {
        if (!this.camNode) return;
        this.camNode.setPosition(CAM_START);
        this.dollyT = 0;
    }

    /** 包围盒适配：按最大边缩放到 targetSize 并居中到自身原点（与 Hangar.fitShip 同算法） */
    private fitToTarget(node: Node, targetSize = SHIP_SIZE): boolean {
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        const aabb = new geometry.AABB();
        const renderers = node.getComponentsInChildren(MeshRenderer);
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
        if (!isFinite(minX)) return false;

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = targetSize / maxDim;
        const localCenter = node.parent!.inverseTransformPoint(new Vec3(), center);
        node.setScale(scale, scale, scale);
        node.setPosition(-localCenter.x * scale, -localCenter.y * scale, -localCenter.z * scale);
        return true;
    }

    private setStatus(msg: string): void {
        if (this.statusLabel) this.statusLabel.string = msg;
    }

    /** 主平行光 + 环境光（前向管线每帧仅 1 盏灯生效，同 Hangar.addLights） */
    private addLights(): void {
        const n = new Node('TopLight');
        const dl = n.addComponent(DirectionalLight);
        dl.illuminance = 100000;
        dl.color = new Color(255, 255, 255, 255);
        n.setRotationFromEuler(-50, -25, 0);
        this.node.scene.addChild(n);

        const ambient = director.root.pipeline.pipelineSceneData.ambient;
        ambient.skyIllum = 60000;
        ambient.groundAlbedo = new Vec4(0.35, 0.35, 0.35, 1);
    }
}
