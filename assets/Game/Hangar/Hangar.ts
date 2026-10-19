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
    Graphics,
    geometry,
    MeshRenderer,
    DirectionalLight,
    Camera,
    ParticleSystem2D,
    SpriteFrame,
    Texture2D,
    Rect,
    assetManager,
    gfx,
    Vec2,
    warn,
} from 'cc';
import { fadeIn, pressEffect } from '../../Common/UIAnim';
import { paintTechButton, TechText, techTextColor } from '../../Common/TechUI';
import { ExitOnBack } from '../../Common/ExitOnBack';

const { ccclass } = _decorator;

// 项目中的 UI 层（与 Home 场景一致：33554432）
const UI_LAYER = 33554432;
// 3D 模型所在层（DEFAULT = 1），UI 相机会一并渲染该层
const MODEL_LAYER = 1;
// 机库飞机统一缩放到的大致尺寸（世界单位）
const TARGET_SHIP_SIZE = 380;
// 机库飞机模型目录（resources 下）
const SHIP_DIR = 'Model/spaceship';
// 机库深色背景色（相机清屏色，与旧全屏 Graphics 填充色一致）
const BG_COLOR = new Color(10, 18, 32, 255);

const SHIP_HALF_SIZE = TARGET_SHIP_SIZE / 2;
const DEFAULT_SPRITE_UUID = '20835ba4-6145-4fbc-a58a-051ce700aa3e';

/**
 * 停机库（Hangar）：游戏入口流程的第二站（Intro 开场动画之后）。
 * 中央展示台自动旋转展示 spaceship 目录下的飞机模型，
 * 底部一排飞机按钮可切换展示。进入游戏后不再提供返回首页入口。
 */
@ccclass('Hangar')
export class Hangar extends Component {
    /** 模型展示根节点（画面中央，DEFAULT 层，由 UI 相机一并渲染） */
    private modelRoot: Node | null = null;
    /** 当前展示的飞机 */
    private currentShip: Node | null = null;
    /** 状态栏 Label */
    private statusLabel: Label | null = null;
    /** 飞机选择按钮列表（可用态刷新用） */
    private shipButtons: Node[] = [];
    /** 是否自动旋转展示 */
    private spin = true;

    onLoad(): void {
        this.addLights();
        this.setupCamera();
        this.buildBackground();
        this.buildUI();
        this.setupModelRoot();
        this.loadShips();
        // 游戏内退出监听：Android 返回键 / ESC 触发确认退出弹窗
        this.node.addComponent(ExitOnBack);
    }

    update(dt: number): void {
        if (this.spin && this.currentShip) {
            this.currentShip.rotate(Quat.fromAxisAngle(new Quat(), Vec3.UP, dt * 0.5));
        }
    }

    /**
     * 将相机清屏色设为机库深色背景。
     * 注意：不能用全屏 UI 节点（Graphics fillRect）做背景——引擎的 UI 阶段
     * （ForwardStage 末尾的 UIPhase）在全部 3D 物体渲染完之后才绘制 2D UI，
     * 且内置 UI 材质关闭了深度测试（builtin-graphics.effect: depthTest=false），
     * 全屏不透明 UI 会把 3D 模型整个盖住（Debug 场景无全屏背景故模型可见）。
     * 相机清屏发生在 3D 渲染之前，天然位于模型之后，不影响模型显示。
     */
    private setupCamera(): void {
        const cam = this.node.scene?.getComponentInChildren(Camera);
        if (cam) cam.clearColor = BG_COLOR;
    }

    /** 四角 HUD 装饰短线 + 中央展示台光环（深色背景由相机清屏色提供） */
    private buildBackground(): void {
        // 四角装饰短线（HUD 风格）
        const bg = new Node('Background');
        bg.layer = this.node.layer;
        bg.addComponent(UITransform).setContentSize(1280, 720);
        const g = bg.addComponent(Graphics);
        g.strokeColor = new Color(0, 214, 255, 90);
        g.lineWidth = 2;
        const cx = 620;
        const cy = 330;
        g.roundRect(-cx, cy - 8, 60, 3, 1.5); g.stroke();
        g.roundRect(cx - 60, cy - 8, 60, 3, 1.5); g.stroke();
        g.roundRect(-cx, -cy + 5, 60, 3, 1.5); g.stroke();
        g.roundRect(cx - 60, -cy + 5, 60, 3, 1.5); g.stroke();
        this.node.addChild(bg);

        // 展示台光环（模型正下方，椭圆光圈）
        const ring = new Node('StageRing');
        ring.layer = UI_LAYER;
        ring.setPosition(0, -150, 0);
        ring.addComponent(UITransform).setContentSize(480, 80);
        const rg = ring.addComponent(Graphics);
        rg.strokeColor = new Color(0, 214, 255, 130);
        rg.lineWidth = 3;
        rg.roundRect(-240, -40, 480, 80, 40);
        rg.stroke();
        rg.strokeColor = new Color(0, 214, 255, 50);
        rg.lineWidth = 2;
        rg.roundRect(-280, -48, 560, 96, 48);
        rg.stroke();
        this.node.addChild(ring);
    }

    /** 标题 / 状态 */
    private buildUI(): void {
        // 标题
        const title = new Node('Title');
        title.layer = this.node.layer;
        title.setPosition(0, 296, 0);
        title.addComponent(UITransform).setContentSize(600, 56);
        const tl = title.addComponent(Label);
        tl.string = '机库 · HANGAR';
        tl.fontSize = 44;
        tl.color = TechText.bright;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(title);

        // 状态栏
        const status = new Node('StatusLabel');
        status.layer = this.node.layer;
        status.setPosition(0, 250, 0);
        status.addComponent(UITransform).setContentSize(800, 32);
        const sl = status.addComponent(Label);
        sl.string = '正在加载飞机…';
        sl.fontSize = 22;
        sl.color = TechText.caption;
        sl.horizontalAlign = Label.HorizontalAlign.CENTER;
        sl.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(status);
        this.statusLabel = sl;
    }

    /**
     * 模型展示根节点：画面中央。
     * 模型在 DEFAULT 层（UI 相机 visibility 包含该层），z=-50 使其位于画布 UI 之前，
     * 只要在相机 near/far（1~2000）内即可被渲染；UI 与模型的遮挡由绘制阶段决定
     * （UI 阶段在 3D 之后，见 setupCamera 注释），不能靠调整 z 轴让 UI 退到模型之后。
     */
    private setupModelRoot(): void {
        this.modelRoot = new Node('ModelRoot');
        this.modelRoot.layer = MODEL_LAYER;
        this.modelRoot.setPosition(0, 60, -50);
        this.node.addChild(this.modelRoot);
    }

    /**
     * 加载 spaceship 目录下的全部飞机：生成底部选择按钮，默认展示第一架。
     */
    private loadShips(): void {
        const infos = resources.getDirWithPath(SHIP_DIR, Prefab);
        if (!infos || infos.length === 0) {
            this.setStatus('未找到飞机模型（请放入 assets/resources/' + SHIP_DIR + ' 目录）');
            return;
        }
        infos.sort((a, b) => a.path.localeCompare(b.path));

        const loaded: { path: string; prefab: Prefab }[] = [];
        let pending = infos.length;
        infos.forEach((info) => {
            resources.load(info.path, Prefab, (err, prefab) => {
                if (err || !prefab) {
                    pending--;
                    if (pending <= 0 && loaded.length === 0) this.setStatus('飞机加载失败');
                    return;
                }
                loaded.push({ path: info.path, prefab });
                pending--;
                if (pending > 0) return;
                this.showShips(loaded);
            });
        });
    }

    /** 生成底部飞机选择按钮并默认展示第一架 */
    private showShips(items: { path: string; prefab: Prefab }[]): void {
        const n = items.length;
        const w = 240;
        const h = 56;
        const gap = 24;
        const totalW = n * w + (n - 1) * gap;
        items.forEach((item, i) => {
            const label = item.path.split('/').pop() || 'ship';
            const x = -totalW / 2 + w / 2 + i * (w + gap);
            const btn = this.createButton('BtnShip_' + label, label, x, -300, w, h, () => {
                this.displayShip(item.prefab, label);
            });
            pressEffect(btn);
            this.shipButtons.push(btn);
            fadeIn(btn, new Vec3(0, 20, 0), 0.05 * i);
        });
        // 默认展示第一架
        const first = items[0];
        const firstName = first.path.split('/').pop() || 'ship';
        this.displayShip(first.prefab, firstName);
        this.setStatus('共 ' + n + ' 架飞机，点击下方按钮切换');
    }

    /** 展示指定飞机（清除旧模型，包围盒适配后居中到展示台） */
    private displayShip(prefab: Prefab, name: string): void {
        this.clearShip();
        const ship = instantiate(prefab);
        this.modelRoot!.addChild(ship);
        this.currentShip = ship;
        // 包围盒适配延迟一帧（渲染 Model 的世界矩阵需管线更新后才有）
        this.scheduleOnce(() => {
            this.fitShip(ship);
            this.createEngineFlame(ship);
        }, 0);
        this.setStatus('当前展示: ' + name);
    }

    private clearShip(): void {
        if (this.currentShip) {
            this.currentShip.destroy();
            this.currentShip = null;
        }
    }

    /** 根据包围盒自动缩放并居中到 ModelRoot 原点（与 Debug.fitModel 同算法） */
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
            maxY = Math.max(maxY, c.y + h.y);
            minZ = Math.min(minZ, c.z - h.z);
            maxZ = Math.max(maxZ, c.z + h.z);
        }
        if (!isFinite(minX)) return;

        const center = new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        const scale = TARGET_SHIP_SIZE / maxDim;
        const localCenter = this.modelRoot!.inverseTransformPoint(new Vec3(), center);
        ship.setScale(scale, scale, scale);
        ship.setPosition(-localCenter.x * scale, -localCenter.y * scale, -localCenter.z * scale);
    }

    /** 科技风按钮（背景 + 文字），返回按钮节点 */
    private createButton(name: string, label: string, x: number, y: number, w: number, h: number, onClick: () => void): Node {
        const btn = new Node(name);
        btn.layer = UI_LAYER;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, 'primary');

        const labNode = new Node('Label');
        labNode.layer = UI_LAYER;
        labNode.addComponent(UITransform).setContentSize(w, h);
        const l = labNode.addComponent(Label);
        l.string = label;
        l.fontSize = 24;
        l.color = techTextColor('primary');
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        btn.addChild(labNode);

        btn.on(Node.EventType.TOUCH_END, onClick, this);
        this.node.addChild(btn);
        return btn;
    }

    private setStatus(msg: string): void {
        if (this.statusLabel) this.statusLabel.string = msg;
    }

    /**
     * 添加主平行光并提升环境光，保证 3D 模型被正确照亮。
     * 注意：前向管线每帧只支持 1 盏灯（LIGHTS_PER_PASS = 1）。
     */
    private addLights(): void {
        const root = this.node.parent;
        if (!root) return;

        const n = new Node('TopLight');
        const dl = n.addComponent(DirectionalLight);
        dl.illuminance = 100000;
        dl.color = new Color(255, 255, 255, 255);
        n.setRotationFromEuler(-50, -25, 0);
        root.addChild(n);

        const ambient = director.root.pipeline.pipelineSceneData.ambient;
        ambient.skyIllum = 60000;
        ambient.groundAlbedo = new Vec4(0.35, 0.35, 0.35, 1);
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
        flameRoot.layer = UI_LAYER;
        flameRoot.setPosition(0, 0, (tailZ - 20) / shipScale);
        flameRoot.setRotationFromEuler(-90, 0, 0);
        flameRoot.setScale(1 / shipScale, 1 / shipScale, 1 / shipScale);
        ship.addChild(flameRoot);

        this.spawnFlameEmitter('FlameCore', flameRoot, {
            totalParticles: 300,
            life: 1.0,
            lifeVar: 0.4,
            startSize: 120,
            startSizeVar: 40,
            endSize: 30,
            endSizeVar: 15,
            speed: 600,
            speedVar: 250,
            angle: 90,
            angleVar: 15,
            emissionRate: 280,
            startColor: new Color(220, 240, 255, 255),
            startColorVar: new Color(30, 15, 0, 0),
            endColor: new Color(120, 180, 255, 0),
            endColorVar: new Color(0, 0, 0, 0),
        });

        this.spawnFlameEmitter('FlameOuter', flameRoot, {
            totalParticles: 400,
            life: 1.3,
            lifeVar: 0.5,
            startSize: 200,
            startSizeVar: 70,
            endSize: 50,
            endSizeVar: 25,
            speed: 450,
            speedVar: 180,
            angle: 90,
            angleVar: 40,
            emissionRate: 220,
            startColor: new Color(255, 180, 80, 230),
            startColorVar: new Color(30, 30, 0, 0),
            endColor: new Color(255, 100, 0, 0),
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