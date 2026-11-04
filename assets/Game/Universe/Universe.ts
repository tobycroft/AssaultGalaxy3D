import {
    _decorator,
    Component,
    Node,
    director,
    resources,
    Prefab,
    instantiate,
    Vec3,
    Vec2,
    Vec4,
    Quat,
    Color,
    UITransform,
    Label,
    Graphics,
    MeshRenderer,
    Material,
    Mesh,
    utils,
    primitives,
    Camera,
    Canvas,
    DirectionalLight,
    input,
    Input,
    EventTouch,
    EventKeyboard,
    KeyCode,
    tween,
    UIOpacity,
    sys,
    geometry,
} from 'cc';
import { fadeIn, pressEffect } from '../../Common/UIAnim';
import { paintTechButton, paintTechPanel, TechText, techTextColor } from '../../Common/TechUI';
import { BrustExplosion } from '../../Effect/Brust/BrustExplosion';
import { ExitOnBack } from '../../Common/ExitOnBack';

const { ccclass } = _decorator;

// 与项目其余场景一致：UI 层由同一台 UI 相机渲染
const UI_LAYER = 33554432;
const MODEL_LAYER = 1;

// 机库 / 宇宙场景共用的出战飞机记录
const ACTIVE_SHIP_KEY = 'ag_active_ship';
const SHIP_DIR = 'Model/spaceship';
const SHIP_SIZE = 260;

// 宇宙归属
const UNIVERSE_NAME = '人类联邦';
const UNIVERSE_SUB = 'HUMAN FEDERATION · SECTOR 01';

// 飞行参数（世界单位；飞船归一化到 260 单位）
const CRUISE_SPEED = 340;
const BOOST_SPEED = 760;
const SHIP_RADIUS = 105;
const SHIP_BOUND_XZ = 16000;
const SHIP_BOUND_Y = 4200;

// 初始空间站（出站后掉头接近即自动回机库）
const HOME_STATION_POS = new Vec3(0, 0, 0);
const HOME_DOCK_RADIUS = 760;
// 其它空间站（进站后是商店/当铺/武器商/造船厂骨架 UI）
const TRADE_STATION_POS = new Vec3(5200, 520, 9500);
const TRADE_DOCK_RADIUS = 820;

// 出生点：空间站在身后，机头朝 +Z（远离空间站）
const SPAWN_POS = new Vec3(0, 180, 2600);

const BG_COLOR = new Color(4, 8, 18, 255);

interface SpaceBullet {
    node: Node;
    dir: Vec3;
    speed: number;
    life: number;
    alive: boolean;
    owner: 'player' | 'enemy';
}

interface SpaceEnemy {
    node: Node;
    core: Node | null;
    hp: number;
    maxHp: number;
    alive: boolean;
    fireTimer: number;
    respawn: number;
    home: Vec3;
}

interface AsteroidBody {
    pos: Vec3;
    radius: number;
}

interface StationDef {
    node: Node;
    name: string;
    pos: Vec3;
    radius: number;
    kind: 'home' | 'trade';
    /** 离开后是否允许再次触发进站 */
    armed: boolean;
}

/**
 * 自由飞行宇宙场景（人类联邦）。
 *
 * 流程：Hangar 选择飞机 → 出击 → 本场景自由飞行。
 * - 初始空间站在身后，机头朝外；掉头接近到阈值自动进站（回 Hangar）。
 * - 远处另有一座空间站，接近后弹出商店/当铺/武器商/造船厂骨架 UI。
 * - 武器支持手动/自动两种模式，自动模式锁定附近敌人开火。
 *
 * 性能约定（沿用 Doc/碎裂特效性能优化.md）：
 * - 场景内不使用百万三角级的 resources/Model 小行星/空间站模型，全部用 primitive 低模，
 *   避免同屏多个高模带来的显存与 draw call 压力；
 * - 只保留 1 盏平行光（前向管线 LIGHTS_PER_PASS = 1），关闭实时阴影；
 * - 2D 爆炸特效复用 BrustExplosion，通过世界→UI 投影贴到敌人位置。
 */
@ccclass('Universe')
export class Universe extends Component {
    /** 主相机 */
    private camera: Camera | null = null;
    private cameraNode: Node | null = null;

    /** 飞船根节点（位置 + 朝向）与模型节点（仅负责滚转视觉） */
    private shipRoot: Node | null = null;
    private shipModel: Node | null = null;
    private engineNode: Node | null = null;
    private shipName = 'default_spaceship';

    /** 飞行状态 */
    private yaw = Math.PI;
    private pitch = 0;
    private roll = 0;
    private prevYaw = Math.PI;
    private modelRollAllowed = true;
    private speed = CRUISE_SPEED;
    private boost = false;
    private forward = new Vec3(0, 0, 1);

    /** 玩家属性 */
    private maxArmor = 120;
    private armor = 120;
    private maxHull = 100;
    private hull = 100;
    private regenDelay = 0;
    private hurtCd = 0;

    /** 武器 */
    private weaponAuto = true;
    private fireCd = 0;
    private firing = false;
    private target: SpaceEnemy | null = null;
    private targetTimer = 0;

    /** 敌人 / 子弹 / 小行星 */
    private enemies: SpaceEnemy[] = [];
    private playerBullets: SpaceBullet[] = [];
    private enemyBullets: SpaceBullet[] = [];
    private asteroids: AsteroidBody[] = [];

    /** 空间站 */
    private stations: StationDef[] = [];
    private stationPanel: Node | null = null;
    private panelStation: StationDef | null = null;
    private leaving = false;
    private tradeArmed = false;

    /** 输入 */
    private keys = new Set<number>();
    private steerTouchId = -1;
    private lastTouch = new Vec2();
    private weaponBtnPos = new Vec3();
    private weaponBtnSize = new Vec2(260, 56);

    /** 相机抖动 */
    private trauma = 0;

    /** 共享材质 */
    private matAsteroid: Material | null = null;
    private matStationHull: Material | null = null;
    private matStationLamp: Material | null = null;
    private matDroneHull: Material | null = null;
    private matDroneCore: Material | null = null;
    private matPlayerBullet: Material | null = null;
    private matEnemyBullet: Material | null = null;
    private matEngine: Material | null = null;

    /** HUD */
    private armorLabel: Label | null = null;
    private hullLabel: Label | null = null;
    private armorBar: Graphics | null = null;
    private hullBar: Graphics | null = null;
    private armorBarSize = new Vec2(250, 12);
    private hullBarSize = new Vec2(250, 12);
    private weaponBtnLabel: Label | null = null;
    private speedLabel: Label | null = null;
    private dockLabel: Label | null = null;
    private targetLabel: Label | null = null;
    private reticle: Graphics | null = null;
    private reticleLocked = false;
    private toastLabel: Label | null = null;
    private hudTimer = 0;
    private lastArmor = -1;
    private lastHull = -1;

    onLoad(): void {
        this.setupCamera();
        this.addLights();
        this.buildMaterials();
        this.buildHomeStation();
        this.buildTradeStation();
        this.buildAsteroids();
        this.buildPlayer();
        this.buildEnemies();
        this.buildBullets();
        this.buildHud();
        this.showUniverseSubtitle();
        this.bindInput();
        this.node.addComponent(ExitOnBack);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    update(dt: number): void {
        if (this.leaving) return;
        if (this.stationPanel) {
            this.updateHud(dt);
            return;
        }
        this.updateFlight(dt);
        this.updateWeapon(dt);
        this.updateEnemies(dt);
        this.updateBullets(dt);
        this.updateCollision();
        this.updateDock();
        this.updateCamera(dt);
        this.updateShake(dt);
        this.updateHud(dt);
    }

    // ------------------------------------------------------------------
    // 场景搭建
    // ------------------------------------------------------------------

    /** 相机：主相机自由跟随飞船；另建一台固定 UI 相机渲染 HUD（Hangar 单相机做法在飞行中会把 UI 拖走） */
    private setupCamera(): void {
        const scene = director.getScene();
        if (!scene) return;
        const cmps = scene.getComponentsInChildren(Camera);
        this.camera = cmps.length > 0 ? cmps[0] : null;
        this.cameraNode = this.camera ? this.camera.node : null;
        if (this.camera) {
            this.camera.clearColor = BG_COLOR;
            this.camera.fov = 60;
            this.camera.near = 1;
            this.camera.far = 20000;
            // 主相机只画 3D（DEFAULT 层），UI 交给独立 UI 相机
            this.camera.visibility = MODEL_LAYER;
            this.camera.priority = 0;
            this.camera.clearFlags = (Camera.ClearFlag.SKYBOX | Camera.ClearFlag.SOLID_COLOR) as any;
        }
        if (this.cameraNode) {
            this.cameraNode.setPosition(SPAWN_POS.x, SPAWN_POS.y + 240, SPAWN_POS.z - 1000);
            this.cameraNode.lookAt(SPAWN_POS);
        }

        // 固定 UI 相机：位置与 Hangar 一致（画布中心 = 屏幕中心），正交、只画 UI 层
        const uiNode = new Node('UICamera');
        uiNode.layer = UI_LAYER;
        uiNode.setPosition(640, 360, 1000);
        const uiCam = uiNode.addComponent(Camera);
        uiCam.projection = Camera.ProjectionType.ORTHO;
        uiCam.orthoHeight = 360;
        uiCam.near = 1;
        uiCam.far = 2000;
        uiCam.visibility = UI_LAYER;
        uiCam.priority = 1;
        uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        scene.addChild(uiNode);

        const canvas = this.node.getComponent(Canvas);
        if (canvas) canvas.cameraComponent = uiCam;
    }

    /** 只加 1 盏平行光，并抬环境光（前向管线单灯限制） */
    private addLights(): void {
        const scene = director.getScene();
        if (!scene) return;
        const n = new Node('TopLight');
        n.layer = MODEL_LAYER;
        const dl = n.addComponent(DirectionalLight);
        dl.illuminance = 90000;
        dl.color = new Color(210, 235, 255, 255);
        n.setRotationFromEuler(-42, -28, 0);
        scene.addChild(n);

        const ambient = director.root.pipeline.pipelineSceneData.ambient;
        ambient.skyIllum = 65000;
        ambient.groundAlbedo = new Vec4(0.12, 0.14, 0.2, 1);
    }

    private buildMaterials(): void {
        this.matAsteroid = this.makeMaterial(new Color(92, 88, 84, 255), false, null);
        this.matStationHull = this.makeMaterial(new Color(58, 66, 82, 255), false, null);
        this.matStationLamp = this.makeMaterial(new Color(90, 235, 255, 255), true, null);
        this.matDroneHull = this.makeMaterial(new Color(74, 58, 66, 255), false, null);
        this.matDroneCore = this.makeMaterial(new Color(255, 82, 96, 255), true, null);
        this.matPlayerBullet = this.makeMaterial(new Color(140, 250, 255, 255), true, null);
        this.matEnemyBullet = this.makeMaterial(new Color(255, 150, 90, 255), true, null);
        this.matEngine = this.makeMaterial(new Color(110, 230, 255, 255), true, null);
    }

    /** 初始空间站（联邦枢纽）：垂直主干 + 水平光环 + 舱段 + 自发光窗口 */
    private buildHomeStation(): void {
        const root = new Node('Station_Home');
        root.layer = MODEL_LAYER;
        root.setPosition(HOME_STATION_POS);
        director.getScene()!.addChild(root);

        this.addStationBody(root, 620, new Color(90, 235, 255, 255));
        this.stations.push({
            node: root,
            name: '联邦枢纽站',
            pos: HOME_STATION_POS.clone(),
            radius: 620,
            kind: 'home',
            armed: true,
        });
    }

    /** 其它空间站（联邦贸易港）：金色灯光，进站后是四类设施骨架 UI */
    private buildTradeStation(): void {
        const root = new Node('Station_Trade');
        root.layer = MODEL_LAYER;
        root.setPosition(TRADE_STATION_POS);
        director.getScene()!.addChild(root);

        this.addStationBody(root, 780, new Color(255, 196, 96, 255));
        this.stations.push({
            node: root,
            name: '联邦贸易港',
            pos: TRADE_STATION_POS.clone(),
            radius: 780,
            kind: 'trade',
            armed: false,
        });
    }

    private addStationBody(root: Node, radius: number, lampColor: Color): void {
        const hull = this.matStationHull!;
        const scale = radius / 620;

        // 主塔
        this.meshNode(
            root, 'Core',
            utils.createMesh(primitives.cylinder(170 * scale, 210 * scale, 900 * scale, { radialSegments: 12 })),
            hull,
        );
        // 水平光环（torus 默认绕 Y 轴，转 90° 变成水平环）
        const ring = this.meshNode(
            root, 'Ring',
            utils.createMesh(primitives.torus(radius, 34 * scale, { radialSegments: 8, tubularSegments: 40 })),
            hull,
        );
        ring.setRotationFromEuler(90, 0, 0);
        // 第二圈斜环
        const ring2 = this.meshNode(
            root, 'Ring2',
            utils.createMesh(primitives.torus(radius * 0.62, 22 * scale, { radialSegments: 8, tubularSegments: 32 })),
            hull,
        );
        ring2.setRotationFromEuler(90, 0, 24);

        // 舱段：沿环均匀分布，带自发光窗口
        const lampMat = this.makeMaterial(lampColor, true, null);
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6;
            const ringNode = new Node('Module_' + i);
            ringNode.layer = MODEL_LAYER;
            ringNode.setPosition(Math.cos(a) * radius, 0, Math.sin(a) * radius);
            ringNode.setRotationFromEuler(0, -a * 57.2958, 0);
            root.addChild(ringNode);
            this.meshNode(
                ringNode, 'Hull',
                utils.createMesh(primitives.box({ width: 160 * scale, height: 110 * scale, length: 240 * scale })),
                hull,
            );
            const lamp = this.meshNode(
                ringNode, 'Window',
                utils.createMesh(primitives.box({ width: 120 * scale, height: 8 * scale, length: 180 * scale })),
                lampMat,
                new Vec3(0, 52 * scale, 0),
            );
            lamp.setScale(1, 1, 1);
        }

        // 中心反应堆 + 顶部航标
        this.meshNode(
            root, 'Reactor',
            utils.createMesh(primitives.sphere(120 * scale, { segments: 14 })),
            lampMat,
        );
        const beacon = this.meshNode(
            root, 'Beacon',
            utils.createMesh(primitives.sphere(40 * scale, { segments: 8 })),
            lampMat,
            new Vec3(0, 500 * scale, 0),
        );
        tween(beacon)
            .to(1.2, { scale: new Vec3(1.35, 1.35, 1.35) })
            .to(1.2, { scale: new Vec3(1, 1, 1) })
            .union()
            .repeatForever()
            .start();
    }

    /** 分散小行星：低模球体，随机非均匀缩放 + 慢速自转（不使用百万三角级 glb） */
    private buildAsteroids(): void {
        const scene = director.getScene();
        if (!scene) return;
        const field = new Node('AsteroidField');
        field.layer = MODEL_LAYER;
        scene.addChild(field);

        const mat = this.matAsteroid!;
        for (let i = 0; i < 24; i++) {
            const radius = 120 + Math.random() * 280;
            const pos = new Vec3(
                (Math.random() * 2 - 1) * 11000,
                (Math.random() * 2 - 1) * 1100,
                3200 + Math.random() * 10000,
            );
            // 避开两座空间站与出生点附近
            if (Vec3.distance(pos, HOME_STATION_POS) < 2200) continue;
            if (Vec3.distance(pos, TRADE_STATION_POS) < 2600) continue;
            if (Vec3.distance(pos, SPAWN_POS) < 1600) continue;

            const seg = 8 + Math.floor(Math.random() * 4);
            const n = this.meshNode(
                field, 'Asteroid_' + i,
                utils.createMesh(primitives.sphere(radius, { segments: seg })),
                mat,
            );
            n.setPosition(pos);
            n.setScale(1, 0.72 + Math.random() * 0.5, 1);
            n.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
            this.asteroids.push({ pos: pos.clone(), radius: radius * 0.92 });
        }
    }

    private buildPlayer(): void {
        const scene = director.getScene();
        if (!scene) return;

        this.shipRoot = new Node('PlayerShip');
        this.shipRoot.layer = MODEL_LAYER;
        this.shipRoot.setPosition(SPAWN_POS);
        this.shipRoot.setRotationFromEuler(0, 180, 0);
        scene.addChild(this.shipRoot);

        // 引擎辉光（挂在根节点上，不受模型缩放影响）
        const engine = this.meshNode(
            this.shipRoot, 'Engine',
            utils.createMesh(primitives.sphere(1, { segments: 10 })),
            this.matEngine!,
            new Vec3(0, 0, 130),
        );
        engine.setScale(22, 22, 64);
        this.engineNode = engine;

        const infos = resources.getDirWithPath(SHIP_DIR, Prefab);
        if (!infos || infos.length === 0) {
            this.buildFallbackShip();
            return;
        }
        infos.sort((a, b) => a.path.localeCompare(b.path));
        let pick = infos[0];
        const saved = sys.localStorage.getItem(ACTIVE_SHIP_KEY) || '';
        for (const info of infos) {
            if (info.path === saved) {
                pick = info;
                break;
            }
        }
        this.shipName = pick.path.split('/').pop() || pick.path;

        resources.load(pick.path, Prefab, (err, prefab) => {
            // 场景可能已在加载期间被销毁（进站 / 阵亡返回机库），此时不能再创建节点
            if (!this.isValid) return;
            if (err || !prefab || this.leaving) {
                this.buildFallbackShip();
                return;
            }
            const model = instantiate(prefab);
            // 先在场景原点（无旋转）做包围盒归一化，再挂回飞船根节点
            const holder = new Node('ShipFit');
            holder.layer = MODEL_LAYER;
            holder.setPosition(0, 0, 0);
            holder.addChild(model);
            scene.addChild(holder);
            this.shipModel = model;
            this.scheduleOnce(() => {
                if (!this.isValid) return;
                this.fitShipModel(model);
                if (this.shipRoot) {
                    model.setParent(this.shipRoot, false);
                }
                holder.destroy();
            }, 0);
        });
    }

    /** 模型加载失败时的兜底飞船（primitive 拼装，保证闭环可玩） */
    private buildFallbackShip(): void {
        if (!this.shipRoot) return;
        const hull = this.makeMaterial(new Color(70, 120, 160, 255), false, null);
        this.meshNode(
            this.shipRoot, 'Hull',
            utils.createMesh(primitives.box({ width: 52, height: 26, length: 190 })),
            hull,
        );
        const nose = this.meshNode(
            this.shipRoot, 'Nose',
            utils.createMesh(primitives.box({ width: 26, height: 18, length: 70 })),
            hull,
            new Vec3(0, 0, -120),
        );
        nose.setScale(1, 1, 1);
        this.meshNode(
            this.shipRoot, 'WingL',
            utils.createMesh(primitives.box({ width: 90, height: 8, length: 60 })),
            hull,
            new Vec3(-60, 0, 30),
        );
        this.meshNode(
            this.shipRoot, 'WingR',
            utils.createMesh(primitives.box({ width: 90, height: 8, length: 60 })),
            hull,
            new Vec3(60, 0, 30),
        );
        this.shipName = 'Federation Scout';
    }

    /** 与 Hangar 同算法：按 AABB 归一化到 SHIP_SIZE 并居中；长轴为 X 时补 90° 对齐机头 -Z */
    private fitShipModel(model: Node): void {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        const aabb = new geometry.AABB();
        const renderers = model.getComponentsInChildren(MeshRenderer);
        for (const r of renderers) {
            const m = r.model;
            if (!m || !m.modelBounds) continue;
            geometry.AABB.transform(aabb, m.modelBounds, r.node.worldMatrix);
            const c = aabb.center;
            const h = aabb.halfExtents;
            minX = Math.min(minX, c.x - h.x); maxX = Math.max(maxX, c.x + h.x);
            minY = Math.min(minY, c.y - h.y); maxY = Math.max(maxY, c.y + h.y);
            minZ = Math.min(minZ, c.z - h.z); maxZ = Math.max(maxZ, c.z + h.z);
        }
        if (!isFinite(minX)) return;

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;
        const maxDim = Math.max(sizeX, sizeY, sizeZ) || 1;
        const scale = SHIP_SIZE / maxDim;
        model.setScale(scale, scale, scale);
        model.setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
        // 长轴不在 Z 上时旋转对齐（项目模型的机头统一按 -Z 处理）
        if (sizeX > sizeZ * 1.15) {
            model.setRotationFromEuler(0, 90, 0);
            this.modelRollAllowed = false;
        }
    }

    /** 3 个验证用敌机：低模无人机，靠近后追击并射击 */
    private buildEnemies(): void {
        const scene = director.getScene();
        if (!scene) return;
        const group = new Node('EnemyGroup');
        group.layer = MODEL_LAYER;
        scene.addChild(group);

        const spots = [
            new Vec3(1800, 300, 4800),
            new Vec3(-3200, -200, 6800),
            new Vec3(900, 620, 8600),
        ];
        for (let i = 0; i < spots.length; i++) {
            const root = new Node('Drone_' + i);
            root.layer = MODEL_LAYER;
            root.setPosition(spots[i]);
            group.addChild(root);

            this.meshNode(
                root, 'Hull',
                utils.createMesh(primitives.box({ width: 84, height: 44, length: 150 })),
                this.matDroneHull!,
            );
            this.meshNode(
                root, 'WingL',
                utils.createMesh(primitives.box({ width: 70, height: 8, length: 46 })),
                this.matDroneHull!,
                new Vec3(-72, 0, 26),
            );
            this.meshNode(
                root, 'WingR',
                utils.createMesh(primitives.box({ width: 70, height: 8, length: 46 })),
                this.matDroneHull!,
                new Vec3(72, 0, 26),
            );
            const core = this.meshNode(
                root, 'Core',
                utils.createMesh(primitives.sphere(17, { segments: 10 })),
                this.matDroneCore!,
                new Vec3(0, 0, -44),
            );

            this.enemies.push({
                node: root,
                core,
                hp: 48,
                maxHp: 48,
                alive: true,
                fireTimer: 2.2 + Math.random() * 1.5,
                respawn: 0,
                home: spots[i].clone(),
            });
        }
    }

    private buildBullets(): void {
        for (let i = 0; i < 28; i++) {
            this.playerBullets.push(this.makeBullet('matPlayerBullet', this.matPlayerBullet!));
        }
        for (let i = 0; i < 16; i++) {
            this.enemyBullets.push(this.makeBullet('matEnemyBullet', this.matEnemyBullet!));
        }
    }

    private makeBullet(name: string, mat: Material): SpaceBullet {
        const n = new Node('Bullet_' + name);
        n.layer = MODEL_LAYER;
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = utils.createMesh(primitives.sphere(1, { segments: 6 }));
        mr.materials = [mat];
        n.setScale(8, 8, 8);
        n.active = false;
        director.getScene()!.addChild(n);
        return { node: n, dir: new Vec3(), speed: 0, life: 0, alive: false, owner: 'player' };
    }

    // ------------------------------------------------------------------
    // 输入
    // ------------------------------------------------------------------

    private bindInput(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    /** 左半屏拖动转向；右半屏按住手动开火 */
    private onTouchStart(e: EventTouch): void {
        if (this.leaving || this.stationPanel) return;
        const p = e.getUILocation();
        if (this.isWeaponButton(p)) return;
        if (p.x < 640) {
            this.steerTouchId = e.getID();
            this.lastTouch.set(p.x, p.y);
        } else {
            this.firing = true;
        }
    }

    private onTouchMove(e: EventTouch): void {
        if (this.stationPanel) return;
        if (e.getID() !== this.steerTouchId) return;
        const p = e.getUILocation();
        const dx = p.x - this.lastTouch.x;
        const dy = p.y - this.lastTouch.y;
        this.yaw -= dx * 0.0036;
        this.pitch += dy * 0.0026;
        this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch));
        this.lastTouch.set(p.x, p.y);
    }

    private onTouchEnd(e: EventTouch): void {
        if (e.getID() === this.steerTouchId) {
            this.steerTouchId = -1;
        } else {
            this.firing = false;
        }
    }

    private onKeyDown(e: EventKeyboard): void {
        if (this.stationPanel) return;
        this.keys.add(e.keyCode);
    }

    private onKeyUp(e: EventKeyboard): void {
        this.keys.delete(e.keyCode);
    }

    private isWeaponButton(p: Vec2): boolean {
        const dx = Math.abs(p.x - (640 + this.weaponBtnPos.x));
        const dy = Math.abs(p.y - (360 + this.weaponBtnPos.y));
        return dx <= this.weaponBtnSize.x / 2 && dy <= this.weaponBtnSize.y / 2;
    }

    private hasKey(code: KeyCode): boolean {
        return this.keys.has(code);
    }

    // ------------------------------------------------------------------
    // 飞行 / 相机
    // ------------------------------------------------------------------

    private updateFlight(dt: number): void {
        if (!this.shipRoot) return;

        // 键盘转向
        const yawRate = 1.35;
        if (this.hasKey(KeyCode.KEY_A) || this.hasKey(KeyCode.ARROW_LEFT)) this.yaw += yawRate * dt;
        if (this.hasKey(KeyCode.KEY_D) || this.hasKey(KeyCode.ARROW_RIGHT)) this.yaw -= yawRate * dt;
        if (this.hasKey(KeyCode.KEY_W) || this.hasKey(KeyCode.ARROW_UP)) this.pitch += 0.9 * dt;
        if (this.hasKey(KeyCode.KEY_S) || this.hasKey(KeyCode.ARROW_DOWN)) this.pitch -= 0.9 * dt;
        this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch));
        this.boost = this.hasKey(KeyCode.SHIFT_LEFT);

        const yawDeg = this.yaw * 57.2958;
        const pitchDeg = this.pitch * 57.2958;
        this.shipRoot.setRotationFromEuler(pitchDeg, yawDeg, 0);

        // 滚转只作用于模型，避免相机跟着歪；模型若做过轴向修正则跳过滚转
        const deltaYaw = this.yaw - this.prevYaw;
        // 拖拽会持续累加 yaw，先算 delta 再把 yaw 归一化到 [-π, π)，避免长时间飞行后浮点精度衰减
        if (this.yaw > Math.PI || this.yaw < -Math.PI) {
            this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        }
        this.prevYaw = this.yaw;
        const targetRoll = Math.max(-0.38, Math.min(0.38, -deltaYaw / Math.max(dt, 0.001) * 0.04));
        this.roll = this.roll * 0.88 + targetRoll * 0.12;
        if (this.shipModel && this.modelRollAllowed) {
            this.shipModel.setRotationFromEuler(0, 0, this.roll * 57.2958);
        }

        // 前向 = -Z 经俯仰/偏航旋转
        const q = Quat.fromEuler(new Quat(), pitchDeg, yawDeg, 0);
        Vec3.transformQuat(this.forward, new Vec3(0, 0, -1), q);
        this.speed = this.boost ? BOOST_SPEED : CRUISE_SPEED;
        if (this.engineNode) {
            const s = this.boost ? 1.35 : 1;
            this.engineNode.setScale(22 * s, 22 * s, 64 * (this.boost ? 1.5 : 1));
        }

        const p = this.shipRoot.position;
        const nx = p.x + this.forward.x * this.speed * dt;
        const ny = p.y + this.forward.y * this.speed * dt;
        const nz = p.z + this.forward.z * this.speed * dt;
        this.shipRoot.setPosition(
            Math.max(-SHIP_BOUND_XZ, Math.min(SHIP_BOUND_XZ, nx)),
            Math.max(-SHIP_BOUND_Y, Math.min(SHIP_BOUND_Y, ny)),
            Math.max(-SHIP_BOUND_XZ, Math.min(SHIP_BOUND_XZ, nz)),
        );

        // 护甲缓慢再生
        this.hurtCd = Math.max(0, this.hurtCd - dt);
        if (this.regenDelay > 0) {
            this.regenDelay -= dt;
        } else if (this.armor < this.maxArmor) {
            this.armor = Math.min(this.maxArmor, this.armor + 6 * dt);
        }
    }

    private updateCamera(dt: number): void {
        if (!this.shipRoot || !this.cameraNode) return;
        const pitchDeg = this.pitch * 57.2958 * 0.55;
        const yawDeg = this.yaw * 57.2958;
        const q = Quat.fromEuler(new Quat(), pitchDeg, yawDeg, 0);
        const offset = Vec3.transformQuat(new Vec3(), new Vec3(0, 240, 1020), q);
        const shipPos = this.shipRoot.position;
        const desired = new Vec3(shipPos.x + offset.x, shipPos.y + offset.y, shipPos.z + offset.z);

        const camPos = this.cameraNode.position;
        const t = 1 - Math.exp(-5.5 * dt);
        const newPos = new Vec3(
            camPos.x + (desired.x - camPos.x) * t,
            camPos.y + (desired.y - camPos.y) * t,
            camPos.z + (desired.z - camPos.z) * t,
        );
        // 抖动叠加（不回写基准，避免累计漂移）
        if (this.trauma > 0.001) {
            const amp = this.trauma * this.trauma * 42;
            newPos.x += (Math.random() * 2 - 1) * amp;
            newPos.y += (Math.random() * 2 - 1) * amp;
        }
        this.cameraNode.setPosition(newPos);
        this.cameraNode.lookAt(new Vec3(
            shipPos.x + this.forward.x * 700,
            shipPos.y + this.forward.y * 700 + 60,
            shipPos.z + this.forward.z * 700,
        ));
    }

    private updateShake(dt: number): void {
        if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }

    private shake(amount: number): void {
        this.trauma = Math.min(1, this.trauma + amount);
    }

    // ------------------------------------------------------------------
    // 武器 / 敌人 / 子弹
    // ------------------------------------------------------------------

    private updateWeapon(dt: number): void {
        this.targetTimer -= dt;
        if (this.targetTimer <= 0) {
            this.targetTimer = 0.35;
            this.target = this.findTarget();
        }
        this.fireCd -= dt;
        const wantFire = this.weaponAuto ? this.target !== null : (this.firing || this.hasKey(KeyCode.SPACE));
        if (!wantFire || this.fireCd > 0) return;

        this.fireCd = this.weaponAuto ? 0.4 : 0.25;
        if (this.weaponAuto && this.target) {
            this.fireBullet(this.target.node.position);
        } else if (!this.weaponAuto) {
            this.fireBullet(null);
        }
    }

    /** 自动模式锁定：前方 ±55°、2600 单位内最近的存活敌人 */
    private findTarget(): SpaceEnemy | null {
        if (!this.shipRoot) return null;
        const shipPos = this.shipRoot.position;
        let best: SpaceEnemy | null = null;
        let bestDist = 2600;
        for (const e of this.enemies) {
            if (!e.alive) continue;
            const to = e.node.position.clone().subtract(shipPos);
            const dist = to.length();
            if (dist < 60 || dist > 2600) continue;
            const dot = Vec3.dot(to.normalize(), this.forward);
            if (dot < Math.cos(55 * Math.PI / 180)) continue;
            if (dist < bestDist) {
                bestDist = dist;
                best = e;
            }
        }
        return best;
    }

    private fireBullet(targetPos: Vec3 | null): void {
        const bullet = this.playerBullets.find((b) => !b.alive);
        if (!bullet || !this.shipRoot) return;
        const shipPos = this.shipRoot.position;
        let dir: Vec3;
        if (targetPos) {
            dir = targetPos.clone().subtract(shipPos).normalize();
        } else {
            dir = this.forward.clone();
        }
        const muzzle = new Vec3(
            shipPos.x + dir.x * 150,
            shipPos.y + dir.y * 150,
            shipPos.z + dir.z * 150,
        );
        bullet.node.setPosition(muzzle);
        bullet.node.active = true;
        bullet.dir = dir;
        bullet.speed = 3400;
        bullet.life = 1.8;
        bullet.alive = true;
        bullet.owner = 'player';
    }

    private fireEnemyBullet(enemy: SpaceEnemy): void {
        const bullet = this.enemyBullets.find((b) => !b.alive);
        if (!bullet || !this.shipRoot) return;
        const from = enemy.node.position;
        const dir = this.shipRoot.position.clone().subtract(from).normalize();
        bullet.node.setPosition(from.x + dir.x * 110, from.y + dir.y * 110, from.z + dir.z * 110);
        bullet.node.active = true;
        bullet.dir = dir;
        bullet.speed = 900;
        bullet.life = 3.2;
        bullet.alive = true;
        bullet.owner = 'enemy';
    }

    private updateEnemies(dt: number): void {
        if (!this.shipRoot) return;
        const playerPos = this.shipRoot.position;
        for (const e of this.enemies) {
            if (!e.alive) {
                e.respawn -= dt;
                if (e.respawn <= 0) {
                    e.alive = true;
                    e.hp = e.maxHp;
                    e.node.active = true;
                    e.node.setPosition(e.home);
                }
                continue;
            }

            const to = playerPos.clone().subtract(e.node.position);
            const dist = to.length();
            const aggro = dist < 2800;
            if (aggro) {
                e.node.lookAt(playerPos);
                if (dist > 1100) {
                    const step = Math.min(190 * dt, dist - 1000);
                    const d = to.normalize();
                    const np = e.node.position;
                    e.node.setPosition(np.x + d.x * step, np.y + d.y * step, np.z + d.z * step);
                }
                e.fireTimer -= dt;
                if (e.fireTimer <= 0 && dist < 2600) {
                    e.fireTimer = 2.2 + Math.random() * 1.2;
                    this.fireEnemyBullet(e);
                }
            } else {
                // 未发现玩家：在初始点附近缓慢巡游
                const t = performance.now() / 1000;
                e.node.setPosition(
                    e.home.x + Math.sin(t * 0.28) * 160,
                    e.home.y + Math.sin(t * 0.42) * 90,
                    e.home.z + Math.cos(t * 0.23) * 160,
                );
                e.node.setRotationFromEuler(0, t * 12, 0);
            }
        }
    }

    private updateBullets(dt: number): void {
        this.stepBullets(this.playerBullets, dt);
        this.stepBullets(this.enemyBullets, dt);
    }

    private stepBullets(pool: SpaceBullet[], dt: number): void {
        for (const b of pool) {
            if (!b.alive) continue;
            const p = b.node.position;
            b.node.setPosition(
                p.x + b.dir.x * b.speed * dt,
                p.y + b.dir.y * b.speed * dt,
                p.z + b.dir.z * b.speed * dt,
            );
            b.life -= dt;
            if (b.life <= 0) {
                b.alive = false;
                b.node.active = false;
                continue;
            }

            if (b.owner === 'player') {
                for (const e of this.enemies) {
                    if (!e.alive) continue;
                    if (Vec3.distance(b.node.position, e.node.position) < 90) {
                        b.alive = false;
                        b.node.active = false;
                        this.damageEnemy(e, 12, b.node.position);
                        break;
                    }
                }
            } else if (this.shipRoot) {
                if (Vec3.distance(b.node.position, this.shipRoot.position) < SHIP_RADIUS) {
                    b.alive = false;
                    b.node.active = false;
                    this.damagePlayer(8);
                }
            }
        }
    }

    private damageEnemy(e: SpaceEnemy, dmg: number, hitPos: Vec3): void {
        e.hp -= dmg;
        this.hitSpark(hitPos);
        tween(e.node).to(0.05, { scale: new Vec3(1.08, 1.08, 1.08) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
        if (e.hp > 0) return;

        e.alive = false;
        e.node.active = false;
        e.hp = 0;
        e.respawn = 14;
        this.explodeAt(e.node.position, 'implode', 1.1);
        this.shake(0.3);
        this.showToast('目标已摧毁 · 14 秒后重新部署');
    }

    private damagePlayer(dmg: number): void {
        if (this.leaving) return;
        this.regenDelay = 4;
        this.shake(0.35);
        if (this.armor > 0) {
            const absorbed = Math.min(this.armor, dmg * 0.7);
            this.armor -= absorbed;
            this.hull -= dmg - absorbed;
        } else {
            this.hull -= dmg;
        }
        if (this.hull <= 0) {
            this.hull = 0;
            this.onShipDestroyed();
        }
    }

    private onShipDestroyed(): void {
        if (this.leaving) return;
        this.leaving = true;
        if (this.shipRoot) {
            this.explodeAt(this.shipRoot.position, 'burn', 1.4);
            this.shipRoot.active = false;
        }
        this.shake(1);
        this.showToast('机体损毁 · 正在执行救援返航');
        this.scheduleOnce(() => {
            director.loadScene('Hangar');
        }, 1.6);
    }

    /** 小行星 / 空间站碰撞：把飞船推出去，避免穿模 */
    private updateCollision(): void {
        if (!this.shipRoot || this.leaving) return;
        const pos = this.shipRoot.position;

        for (const a of this.asteroids) {
            const d = Vec3.distance(pos, a.pos);
            const minD = a.radius + SHIP_RADIUS;
            if (d >= minD || d <= 0.001) continue;
            const normal = pos.clone().subtract(a.pos).normalize();
            const pushTo = a.pos.clone().add(normal.multiplyScalar(minD + 2));
            this.shipRoot.setPosition(pushTo);
            if (this.hurtCd <= 0) {
                this.hurtCd = 1.2;
                this.damagePlayer(12);
                this.showToast('撞击小行星 · 护甲受损');
            }
        }
    }

    // ------------------------------------------------------------------
    // 进站
    // ------------------------------------------------------------------

    private updateDock(): void {
        if (!this.shipRoot || this.leaving || this.stationPanel) return;
        const pos = this.shipRoot.position;

        for (const st of this.stations) {
            const d = Vec3.distance(pos, st.pos);
            if (st.kind === 'home') {
                if (d < HOME_DOCK_RADIUS) {
                    this.leaving = true;
                    this.showToast('已进入 ' + st.name + ' · 返回机库');
                    this.scheduleOnce(() => director.loadScene('Hangar'), 0.9);
                    return;
                }
            } else {
                if (d > st.radius * 2.4) {
                    this.tradeArmed = true;
                } else if (d < TRADE_DOCK_RADIUS && this.tradeArmed) {
                    this.tradeArmed = false;
                    this.openStationPanel(st);
                    return;
                }
            }
        }
    }

    /** 其它空间站进站 UI 骨架：四类设施占位 + 离开 */
    private openStationPanel(st: StationDef): void {
        this.panelStation = st;
        this.firing = false;
        this.steerTouchId = -1;

        const overlay = new Node('StationOverlay');
        overlay.layer = UI_LAYER;
        overlay.addComponent(UITransform).setContentSize(1280, 720);
        const dim = overlay.addComponent(Graphics);
        dim.fillColor = new Color(0, 0, 0, 165);
        dim.fillRect(-640, -360, 1280, 720);
        this.node.addChild(overlay);

        const panel = new Node('StationPanel');
        panel.layer = UI_LAYER;
        panel.addComponent(UITransform).setContentSize(820, 540);
        paintTechPanel(panel.addComponent(Graphics), 820, 540, 20);
        overlay.addChild(panel);
        fadeIn(panel, new Vec3(0, -24, 0), 0, 0.3);

        const title = new Node('Title');
        title.layer = UI_LAYER;
        title.setPosition(0, 200, 0);
        title.addComponent(UITransform).setContentSize(700, 48);
        const tl = title.addComponent(Label);
        tl.string = st.name + ' · 设施对接';
        tl.fontSize = 34;
        tl.color = TechText.bright;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        panel.addChild(title);

        const sub = new Node('Sub');
        sub.layer = UI_LAYER;
        sub.setPosition(0, 160, 0);
        sub.addComponent(UITransform).setContentSize(700, 28);
        const sl = sub.addComponent(Label);
        sl.string = '设施骨架已接入 · 交易逻辑将在下一阶段开放';
        sl.fontSize = 18;
        sl.color = TechText.caption;
        sl.horizontalAlign = Label.HorizontalAlign.CENTER;
        panel.addChild(sub);

        const entries: { label: string; key: string }[] = [
            { label: '商店 · SHOP', key: '商店' },
            { label: '当铺 · PAWN', key: '当铺' },
            { label: '武器商 · ARMS', key: '武器商' },
            { label: '造船厂 · SHIPYARD', key: '造船厂' },
        ];
        entries.forEach((entry, i) => {
            const x = i % 2 === 0 ? -210 : 210;
            const y = i < 2 ? 70 : -20;
            this.createPanelButton(panel, entry.label, x, y, () => {
                this.showToast(entry.key + '：框架占位，暂未实现交易');
            });
        });

        this.createPanelButton(panel, '离开空间站 · DEPART', 0, -150, () => {
            this.closeStationPanel();
        }, 'ghost');

        this.stationPanel = overlay;
    }

    private createPanelButton(parent: Node, text: string, x: number, y: number, onClick: () => void, kind: 'primary' | 'ghost' = 'primary'): void {
        const w = 340;
        const h = 62;
        const btn = new Node('Btn_' + text);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);
        pressEffect(btn);

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = text;
        l.fontSize = 22;
        l.color = techTextColor(kind);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        btn.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(btn);
    }

    private closeStationPanel(): void {
        if (this.stationPanel) {
            this.stationPanel.destroy();
            this.stationPanel = null;
        }
        const st = this.panelStation;
        this.panelStation = null;
        if (!st || !this.shipRoot) return;

        // 离开时把飞船放到站外并朝外飞，避免再次触发进站
        const out = this.shipRoot.position.clone().subtract(st.pos);
        if (out.length() < 0.01) out.set(0, 0, 1);
        out.normalize();
        const away = st.pos.clone().add(out.multiplyScalar(st.radius + 1600));
        this.shipRoot.setPosition(away);
        this.yaw = Math.atan2(-out.x, -out.z);
        this.pitch = 0;
        this.tradeArmed = false;
        this.showToast('已离开 ' + st.name);
    }

    // ------------------------------------------------------------------
    // HUD / 字幕 / 特效
    // ------------------------------------------------------------------

    private buildHud(): void {
        // 左上：战机名 + 护甲/结构
        this.hudLabel('战机 · ' + this.shipName, 20, TechText.bright, -470, 306, 320, Label.HorizontalAlign.LEFT);
        this.armorLabel = this.hudLabel('护甲 ARMOR 120/120', 16, TechText.dim, -470, 276, 320, Label.HorizontalAlign.LEFT);
        this.armorBar = this.hudBar(-470, 252, 250, 12, new Color(90, 220, 255, 255));
        this.hullLabel = this.hudLabel('结构 HULL 100/100', 16, TechText.dim, -470, 228, 320, Label.HorizontalAlign.LEFT);
        this.hullBar = this.hudBar(-470, 204, 250, 12, new Color(120, 255, 176, 255));

        // 顶部中央：宇宙名 + 字幕
        this.hudLabel(UNIVERSE_NAME + ' · HUMAN FEDERATION', 22, TechText.caption, 0, 332, 700);

        // 右上：空间站距离
        this.dockLabel = this.hudLabel('联邦贸易港 · --', 17, TechText.dim, 470, 306, 320, Label.HorizontalAlign.RIGHT);
        this.dockLabel.node.getComponent(UITransform)!.setContentSize(320, 52);

        // 底部：航速 + 操作提示
        this.speedLabel = this.hudLabel('航速 340', 18, TechText.dim, 0, -302, 300);
        this.hudLabel('左半屏拖动转向 · 右半屏按住开火 · 空格手动射击', 17, TechText.dim, 0, -332, 760);

        // 右下：武器模式按钮
        const btnW = 260;
        const btnH = 56;
        this.weaponBtnPos.set(430, -300, 0);
        this.weaponBtnSize.set(btnW, btnH);
        const btn = new Node('BtnWeaponMode');
        btn.layer = UI_LAYER;
        btn.setPosition(this.weaponBtnPos);
        btn.addComponent(UITransform).setContentSize(btnW, btnH);
        paintTechButton(btn.addComponent(Graphics), btnW, btnH, 'primary');
        pressEffect(btn);
        this.node.addChild(btn);

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(btnW, btnH);
        const l = labNode.addComponent(Label);
        l.string = '武器：自动锁定';
        l.fontSize = 21;
        l.color = TechText.primary;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);
        this.weaponBtnLabel = l;
        btn.on(Node.EventType.TOUCH_END, () => this.toggleWeaponMode(), this);

        // 中心准星
        this.reticle = this.hudBar(0, 0, 46, 46, new Color(0, 0, 0, 0));
        this.drawReticle(false);

        // 锁定目标提示
        this.targetLabel = this.hudLabel('', 16, TechText.caption, 0, -56, 420);

        // Toast
        this.toastLabel = this.hudLabel('', 18, TechText.bright, 0, -240, 760);
        const toastOpacity = this.toastLabel.node.addComponent(UIOpacity);
        toastOpacity.opacity = 0;
    }

    private hudLabel(text: string, size: number, color: Color, x: number, y: number, w: number, align: number = Label.HorizontalAlign.CENTER): Label {
        const n = new Node('Label');
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, size + 10);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 4;
        l.color = color;
        l.horizontalAlign = align as any;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.NONE;
        this.node.addChild(n);
        return l;
    }

    private hudBar(x: number, y: number, w: number, h: number, color: Color): Graphics {
        const n = new Node('Bar');
        n.layer = UI_LAYER;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        this.node.addChild(n);
        this.drawBar(g, w, h, 1, color);
        return g;
    }

    private drawBar(g: Graphics, w: number, h: number, ratio: number, color: Color): void {
        const r = Math.min(h / 2, 6);
        g.clear();
        g.fillColor = new Color(8, 18, 32, 220);
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        const fw = Math.max(0, Math.min(w, w * ratio));
        if (fw > 3) {
            g.fillColor = color;
            g.roundRect(-w / 2, -h / 2, fw, h, Math.min(r, fw / 2));
            g.fill();
        }
        g.strokeColor = new Color(0, 190, 230, 160);
        g.lineWidth = 1;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.stroke();
    }

    /** 准星：四个短块 + 中心点（避免 moveTo/lineTo，项目 Web 端已验证不渲染自定义路径） */
    private drawReticle(locked: boolean): void {
        if (!this.reticle) return;
        const g = this.reticle;
        const c = locked ? new Color(255, 96, 120, 255) : new Color(0, 214, 255, 210);
        g.clear();
        g.fillColor = c;
        g.roundRect(-21, -2, 14, 4, 2); g.fill();
        g.roundRect(7, -2, 14, 4, 2); g.fill();
        g.roundRect(-2, 7, 4, 14, 2); g.fill();
        g.roundRect(-2, -21, 4, 14, 2); g.fill();
        g.fillColor = locked ? new Color(255, 150, 170, 255) : new Color(125, 240, 255, 255);
        g.roundRect(-3, -3, 6, 6, 3); g.fill();
    }

    private toggleWeaponMode(): void {
        this.weaponAuto = !this.weaponAuto;
        if (this.weaponBtnLabel) {
            this.weaponBtnLabel.string = this.weaponAuto ? '武器：自动锁定' : '武器：手动射击';
            this.weaponBtnLabel.color = this.weaponAuto ? TechText.primary : TechText.caption;
        }
        this.showToast(this.weaponAuto ? '武器切换为自动锁定' : '武器切换为手动射击');
    }

    private updateHud(dt: number): void {
        this.hudTimer -= dt;
        const armorRatio = this.armor / this.maxArmor;
        const hullRatio = this.hull / this.maxHull;

        if (this.armorLabel) this.armorLabel.string = '护甲 ARMOR ' + Math.ceil(this.armor) + '/' + this.maxArmor;
        if (this.hullLabel) this.hullLabel.string = '结构 HULL ' + Math.ceil(this.hull) + '/' + this.maxHull;
        if (this.armorBar && Math.abs(this.armor - this.lastArmor) > 0.5) {
            this.lastArmor = this.armor;
            this.drawBar(this.armorBar, this.armorBarSize.x, this.armorBarSize.y, armorRatio, new Color(90, 220, 255, 255));
        }
        if (this.hullBar && Math.abs(this.hull - this.lastHull) > 0.5) {
            this.lastHull = this.hull;
            this.drawBar(this.hullBar, this.hullBarSize.x, this.hullBarSize.y, hullRatio, new Color(120, 255, 176, 255));
        }
        if (this.hudTimer > 0) return;

        this.hudTimer = 0.15;
        if (this.speedLabel) this.speedLabel.string = '航速 ' + Math.round(this.speed);

        const locked = this.target !== null;
        if (locked !== this.reticleLocked) {
            this.reticleLocked = locked;
            this.drawReticle(locked);
        }
        if (this.targetLabel) {
            if (this.target) {
                const d = Vec3.distance(this.shipRoot!.position, this.target.node.position);
                this.targetLabel.string = '已锁定 · 距离 ' + Math.round(d) + ' m';
            } else {
                this.targetLabel.string = this.weaponAuto ? '扫描中 · 未发现目标' : '';
            }
        }
        if (this.dockLabel) {
            let trade: StationDef | null = null;
            let home: StationDef | null = null;
            for (const st of this.stations) {
                if (st.kind === 'trade') trade = st;
                else home = st;
            }
            const pos = this.shipRoot ? this.shipRoot.position : SPAWN_POS;
            const dTrade = trade ? Vec3.distance(pos, trade.pos) : 0;
            const dHome = home ? Vec3.distance(pos, home.pos) : 0;
            this.dockLabel.string = '联邦贸易港 · ' + (dTrade / 1000).toFixed(1) + ' km\n联邦枢纽站 · ' + (dHome / 1000).toFixed(1) + ' km';
        }
    }

    private showUniverseSubtitle(): void {
        const main = this.hudLabel('已到达  ' + UNIVERSE_NAME, 34, TechText.bright, 0, 190, 900);
        const sub = this.hudLabel(UNIVERSE_SUB, 18, TechText.caption, 0, 154, 900);
        const opMain = main.node.addComponent(UIOpacity);
        const opSub = sub.node.addComponent(UIOpacity);
        opMain.opacity = 0;
        opSub.opacity = 0;
        tween(opMain).delay(0.35).to(0.5, { opacity: 255 }).delay(2.0).to(0.6, { opacity: 0 }).start();
        tween(opSub).delay(0.55).to(0.5, { opacity: 255 }).delay(1.8).to(0.6, { opacity: 0 }).start();
    }

    private toastSeq = 0;
    private showToast(msg: string): void {
        if (!this.toastLabel) return;
        this.toastLabel.string = msg;
        // 置顶显示，避免被空间站面板遮住
        this.toastLabel.node.setSiblingIndex(this.node.children.length - 1);
        const op = this.toastLabel.node.getComponent(UIOpacity);
        if (!op) return;
        this.toastSeq++;
        const seq = this.toastSeq;
        op.opacity = 0;
        tween(op).to(0.18, { opacity: 255 }).delay(1.6).to(0.4, { opacity: 0 }).call(() => {
            if (seq === this.toastSeq) this.toastLabel!.string = '';
        }).start();
    }

    /** 命中火花：屏幕空间小方光点，避免每个弹着点都起 2D 粒子系统 */
    private hitSpark(pos: Vec3): void {
        const sp = this.project(pos);
        if (!sp) return;
        const n = new Node('HitSpark');
        n.layer = UI_LAYER;
        n.setPosition(sp.x - 640, sp.y - 360, 0);
        n.addComponent(UITransform).setContentSize(16, 16);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(255, 238, 170, 255);
        g.roundRect(-3, -3, 6, 6, 3);
        g.fill();
        this.node.addChild(n);
        const op = n.addComponent(UIOpacity);
        tween(op).to(0.22, { opacity: 0 }).call(() => n.destroy()).start();
    }

    /** 复用 BrustExplosion：世界坐标投影到 UI 坐标，按距离缩放 */
    private explodeAt(pos: Vec3, type: 'burn' | 'zone' | 'implode', baseScale = 1): void {
        const sp = this.project(pos);
        if (!sp || !this.cameraNode) return;
        const dist = Vec3.distance(this.cameraNode.worldPosition, pos);
        const s = Math.min(1.3, Math.max(0.12, 1100 / Math.max(200, dist))) * baseScale;
        const fx = BrustExplosion.play(this.node, { type, scale: s });
        fx.node.setPosition(sp.x - 640, sp.y - 360, 0);
    }

    private project(pos: Vec3): Vec3 | null {
        if (!this.camera) return null;
        return this.camera.worldToScreen(pos, new Vec3());
    }

    // ------------------------------------------------------------------
    // 低模网格 / 材质工具
    // ------------------------------------------------------------------

    private meshNode(parent: Node, name: string, mesh: Mesh, mat: Material, pos?: Vec3): Node {
        const n = new Node(name);
        n.layer = MODEL_LAYER;
        if (pos) n.setPosition(pos);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.materials = [mat];
        parent.addChild(n);
        return n;
    }

    private makeMaterial(color: Color, unlit: boolean, emissive: Color | null): Material {
        const mat = new Material();
        mat.initialize({ effectName: unlit ? 'builtin-unlit' : 'builtin-standard' });
        mat.setProperty(unlit ? 'mainColor' : 'albedo', color);
        if (emissive) {
            mat.setProperty('emissive', emissive);
            mat.setProperty('emissiveScale', 1);
        }
        return mat;
    }
}
