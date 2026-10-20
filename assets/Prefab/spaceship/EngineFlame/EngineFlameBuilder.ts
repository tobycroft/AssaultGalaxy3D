import {
    _decorator,
    Component,
    Node,
    Vec3,
    Color,
    Camera,
    Canvas,
    Label,
    UITransform,
    Gradient,
    GradientRange,
    CurveRange,
    MeshRenderer,
    Material,
    Mesh,
    ParticleSystem,
    Prefab,
    Texture2D,
    builtinResMgr,
    js,
    assetManager,
    instantiate,
    find,
} from 'cc';

const { ccclass } = _decorator;

/** EngineFlame 预制件配套资源目录 */
const RES_DIR = 'db://assets/Prefab/spaceship/EngineFlame/';
/** 核心锥形网格来源（glb 导入后的模型预制件 uuid） */
const CORE_MESH_UUID = '5f44f4ad-6f1c-4b90-89a4-dbe956cea71a';
/** 核心材质（unlit + add technique）uuid */
const CORE_MAT_UUID = '242db130-ec47-4d87-9195-0c58c1cf04d3';
/** 粒子材质（builtin-particle add technique）uuid */
const PARTICLE_MAT_UUID = '4f266ede-9c48-4dce-8f21-a5f19506d5fd';

/**
 * 临时构建脚本：只在编辑器里用于生成 EngineFlame.prefab，
 * 生成完毕后脚本与临时场景一并删除，不参与运行时。
 */
@ccclass('EngineFlameBuilder')
export class EngineFlameBuilder extends Component {
    /** 由编辑器通过 execute_method 调用 */
    async build(): Promise<string> {
        const diag: string[] = [];
        diag.push(`Editor=${typeof (globalThis as any).Editor}`);
        const mesh = await this.loadCoreMesh(diag);
        const coreMat = await this.loadMaterial(CORE_MAT_UUID, diag);
        const particleMat = await this.loadMaterial(PARTICLE_MAT_UUID, diag);
        if (!mesh || !coreMat || !particleMat) {
            return `FAILED: mesh=${!!mesh} coreMat=${!!coreMat} particleMat=${!!particleMat} | ${diag.join(' ; ')}`;
        }

        const root = new Node('EngineFlame');
        const core = new Node('PlasmaCore');
        const jet = new Node('CoreJet');
        const particles = new Node('PlasmaParticles');
        root.addChild(core);
        core.addChild(jet);
        root.addChild(particles);

        // 外层等离子鞘：底面贴住喷口，沿 -Z 方向拉长
        const coreRenderer = core.addComponent(MeshRenderer);
        coreRenderer.mesh = mesh;
        core.setScale(0.04, 0.04, 0.45);

        // 内层高温射流：更短更窄，加法混合下透出亮芯
        const jetRenderer = jet.addComponent(MeshRenderer);
        jetRenderer.mesh = mesh;
        jet.setScale(0.022, 0.022, 0.26);

        // 先挂进场景，组件 onLoad 跑完后模块才会正确绑定
        this.node.parent!.addChild(root);
        this.configureParticles(particles, particleMat);

        coreRenderer.setSharedMaterial(coreMat, 0);
        jetRenderer.setSharedMaterial(coreMat, 0);

        return `OK root=${root.uuid} children=${root.children.length}`;
    }

    /** 预览用：把预制件实例放大到飞船尺度，并让相机从船尾方向观察 */
    setupPreview(uuid: string): string {
        const scene = this.node.scene;
        const findByUuid = (node: Node): Node | null => {
            if (node.uuid === uuid) return node;
            for (const c of node.children) {
                const r = findByUuid(c);
                if (r) return r;
            }
            return null;
        };
        const flame = scene ? findByUuid(scene) : null;
        if (!flame) return 'flame not found';
        // 飞船运行时缩放为 380，这里保持一致以便观察真实尺寸比例
        flame.setScale(380, 380, 380);
        const camera = scene ? scene.getComponentInChildren(Camera) : null;
        if (camera) {
            camera.projection = Camera.ProjectionType.PERSPECTIVE;
            camera.fov = 45;
            camera.near = 1;
            camera.far = 5000;
            camera.clearColor = new Color(0, 0, 0, 255);
            camera.node.setPosition(0, 0, -420);
            camera.node.lookAt(new Vec3(0, 0, -80));
        }
        const ps = flame.getComponentInChildren(ParticleSystem);
        if (ps) ps.play();
        return `preview ok scale=${flame.scale.x} cam=${camera ? camera.node.position.z : 'none'}`;
    }

    /** 预览用：切换观察角度（side=侧面，rear=正后方，top=俯视） */
    previewView(uuid: string, mode: string): string {
        const scene = this.node.scene;
        const findByUuid = (node: Node): Node | null => {
            if (node.uuid === uuid) return node;
            for (const c of node.children) {
                const r = findByUuid(c);
                if (r) return r;
            }
            return null;
        };
        const flame = scene ? findByUuid(scene) : null;
        if (!flame) return 'flame not found';
        const camera = scene ? scene.getComponentInChildren(Camera) : null;
        if (!camera) return 'camera not found';
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 45;
        camera.clearColor = new Color(0, 0, 0, 255);
        if (mode === 'side') {
            camera.node.setPosition(320, 0, -80);
            camera.node.lookAt(new Vec3(0, 0, -80));
        } else if (mode === 'top') {
            camera.node.setPosition(0, 320, -80);
            camera.node.lookAt(new Vec3(0, 0, -80));
        } else {
            camera.node.setPosition(0, 0, -420);
            camera.node.lookAt(new Vec3(0, 0, -80));
        }
        return `view=${mode} cam=${camera.node.position.x},${camera.node.position.y},${camera.node.position.z}`;
    }

    /** 运行时诊断：在画面上打印粒子系统关键信息（临时用，交付前删除） */
    onLoad(): void {
        this._diagTicks = 0;
        this._diagLines = [];
        this.schedule(() => this.showDiagnostics(), 0.5);
    }

    private _diagTicks = 0;
    private _diagLabel: Label | null = null;
    private _diagLines: string[] = [];

    private showDiagnostics(): void {
        const scene = this.node.scene;
        if (!scene) return;
        const ps = scene.getComponentsInChildren(ParticleSystem)[0];
        if (ps) {
            const scale = new Vec3();
            ps.node.getWorldScale(scale);
            const mat = ps.renderer.particleMaterial;
            const s = `t=${this._diagTicks} count=${ps.getParticleCount()} playing=${ps.isPlaying} worldScale=${scale.x.toFixed(0)} nodeScale=${ps.node.scale.x} mat=${mat ? mat.name : 'null'} tex=${mat && mat.getProperty('mainTexture', 0) ? 'yes' : 'no'} simSpace=${ps.simulationSpace} scaleSpace=${ps.scaleSpace}`;
            this._diagLines.push(s);
            console.log('[EngineFlameDiag]', s);
        }

        if (this._diagTicks === 0) {
            const canvas = scene.getComponentInChildren(Canvas);
            if (canvas) {
                const labelNode = new Node('DiagLabel');
                labelNode.layer = 33554432;
                const label = labelNode.addComponent(Label);
                label.fontSize = 22;
                label.useSystemFont = true;
                label.color = new Color(255, 255, 0, 255);
                label.horizontalAlign = Label.HorizontalAlign.LEFT;
                label.verticalAlign = Label.VerticalAlign.TOP;
                labelNode.addComponent(UITransform).setContentSize(1200, 400);
                labelNode.setPosition(-520, 330, 0);
                canvas.node.addChild(labelNode);
                this._diagLabel = label;
            }
        }

        if (this._diagLabel) {
            this._diagLabel.string = this._diagLines.join('\n');
        }

        this._diagTicks++;
        if (this._diagTicks > 8) this.unscheduleAllCallbacks();
    }

    /**
     * 诊断：构造一个独立的对照粒子系统（不复用预制件），
     * 用 1_opening.ts 已验证可行的方式（运行时 clone 内置粒子材质 + 手动 new 模块）；
     * 若该粒子在运行时可见而预制件粒子不可见，说明问题在预制件序列化内容上。
     * 用法：编辑器内调用 diagProbe()，然后出图看画面左侧是否出现一团光球。
     */
    diagProbe(): string {
        const scene = this.node.scene;
        if (!scene) return 'no scene';
        const root = scene.getChildByName('DiagProbe') || new Node('DiagProbe');
        if (!root.parent) scene.addChild(root);

        const node = new Node('ProbeParticles');
        const ps = node.addComponent(ParticleSystem);
        ps.duration = 1;
        ps.loop = true;
        ps.playOnAwake = true;
        ps.prewarm = true;
        ps.capacity = 60;

        ps.startLifetime.mode = 3;
        ps.startLifetime.constantMin = 0.5;
        ps.startLifetime.constantMax = 0.9;
        ps.startSpeed.mode = 3;
        ps.startSpeed.constantMin = 60;
        ps.startSpeed.constantMax = 100;
        ps.startSizeX.mode = 3;
        ps.startSizeX.constantMin = 20;
        ps.startSizeX.constantMax = 30;
        ps.startSizeY.mode = 3;
        ps.startSizeY.constantMin = 20;
        ps.startSizeY.constantMax = 30;
        ps.startColor.mode = 0;
        ps.startColor.color = new Color(255, 255, 255, 255);
        ps.rateOverTime.mode = 0;
        ps.rateOverTime.constant = 60;

        // 关键：运行时手动 new 模块再赋值（编辑器 getter 才懒创建）
        const shapeCtor = js.getClassByName('cc.ShapeModule') as (new () => {
            enable: boolean; shapeType: number; radius: number; angle: number; radiusThickness: number; length: number;
        }) | undefined;
        const shape = shapeCtor ? new shapeCtor() : null;
        if (shape) {
            shape.enable = true;
            shape.shapeType = 2; // Cone
            shape.radius = 5;
            shape.angle = 25;
            shape.radiusThickness = 1;
            shape.length = 0;
            ps.shapeModule = shape as unknown as typeof ps.shapeModule;
        }

        const colorCtor = js.getClassByName('cc.ColorOvertimeModule') as (new () => {
            enable: boolean; color: { mode: number; gradient: Gradient | null };
        }) | undefined;
        const color = colorCtor ? new colorCtor() : null;
        if (color) {
            color.enable = true;
            color.color.mode = 1;
            const g = new Gradient();
            g.setKeys(
                [{ color: new Color(255, 255, 255), time: 0 }, { color: new Color(80, 150, 255), time: 1 }],
                [{ alpha: 1, time: 0 }, { alpha: 0, time: 1 }],
            );
            color.color.gradient = g;
            ps.colorOverLifetimeModule = color as unknown as typeof ps.colorOverLifetimeModule;
        }

        const sizeCtor = js.getClassByName('cc.SizeOvertimeModule') as (new () => {
            enable: boolean; size: { mode: number; constant: number };
        }) | undefined;
        const size = sizeCtor ? new sizeCtor() : null;
        if (size) {
            size.enable = true;
            size.size.mode = 0;
            size.size.constant = 0.4;
            ps.sizeOvertimeModule = size as unknown as typeof ps.sizeOvertimeModule;
        }

        ps.renderer.renderMode = 1;
        ps.renderer.velocityScale = 0.5;
        ps.renderer.lengthScale = 1.5;

        // 已验证可行：clone 内置粒子材质并挂贴图
        const proto = builtinResMgr.get<Material>('default-particle-material');
        const mat = proto ? new Material() : null;
        if (proto && mat) {
            mat.copy(proto);
            mat.setProperty('mainTexture', this.getDiagGlowTexture());
            ps.setSharedMaterial(mat, 0);
        }

        // 放在中间偏左（世界单位，无父节点缩放）
        node.setPosition(-60, 0, -80);
        root.addChild(node);
        ps.play();
        return `probe built shape=${!!shape} color=${!!color} size=${!!size} mat=${mat ? mat.name : 'null'}`;
    }

    /** 用 plasma_particle.png 作为诊断贴图（已存在的项目资源） */
    private getDiagGlowTexture(): Texture2D | null {
        const tex = assetManager.assets.find((a) => a && (a as { name?: string }).name === 'plasma-particle') as Material | undefined;
        if (tex) {
            const t = tex.getProperty('mainTexture', 0) as Texture2D | undefined;
            if (t) return t;
        }
        return null;
    }

    /** 编辑器内播放粒子，便于后续读取粒子数量（临时诊断用） */
    startDiag(uuid: string): string {
        const scene = this.node.scene;
        const findByUuid = (node: Node): Node | null => {
            if (node.uuid === uuid) return node;
            for (const c of node.children) {
                const r = findByUuid(c);
                if (r) return r;
            }
            return null;
        };
        const node = scene ? findByUuid(scene) : null;
        if (!node) return 'node not found';
        const ps = node.getComponentInChildren(ParticleSystem);
        if (!ps) return 'no ps';
        ps.play();
        return 'playing=' + ps.isPlaying;
    }

    /** 校验预制件实例在运行时的关键参数（材质、粒子模块） */
    verify(uuid: string): string {
        const scene = this.node.scene;
        const findByUuid = (node: Node): Node | null => {
            if (node.uuid === uuid) return node;
            for (const c of node.children) {
                const r = findByUuid(c);
                if (r) return r;
            }
            return null;
        };
        const node = scene ? findByUuid(scene) : null;
        if (!node) return `node not found (${uuid})`;
        const out: string[] = [];
        out.push(`root=${node.name} scale=${node.scale.x},${node.scale.y},${node.scale.z}`);
        node.getComponentsInChildren(MeshRenderer).forEach((r) => {
            const mats = r.sharedMaterials;
            out.push(`mesh ${r.node.name} mesh=${r.mesh ? r.mesh.name : 'null'} mats=${mats.map((m) => (m ? m.name : 'null')).join('|')} effect=${mats[0] ? mats[0].effectName : '-'}`);
        });
        const ps = node.getComponentInChildren(ParticleSystem);
        if (ps) {
            const shape = ps.shapeModule;
            const colorMod = ps.colorOverLifetimeModule;
            const sizeMod = ps.sizeOvertimeModule;
            const ws = new Vec3();
            ps.node.getWorldScale(ws);
            out.push(`ps count=${ps.getParticleCount()} playing=${ps.isPlaying} worldScale=${ws.x}`);
            out.push(`ps cap=${ps.capacity} dur=${ps.duration} loop=${ps.loop} life=${ps.startLifetime.constantMin}~${ps.startLifetime.constantMax} mode=${ps.startLifetime.mode}`);
            out.push(`ps speed=${ps.startSpeed.constantMin}~${ps.startSpeed.constantMax} size=${ps.startSizeX.constantMin}~${ps.startSizeX.constantMax} rate=${ps.rateOverTime.constant} color=${ps.startColor.color.toString()}`);
            out.push(`ps shape=${shape ? `${shape.shapeType} r=${shape.radius} a=${shape.angle}` : 'null'}`);
            out.push(`ps colorMod=${colorMod ? `${colorMod.enable} mode=${colorMod.color.mode} grad=${!!colorMod.color.gradient}` : 'null'}`);
            out.push(`ps sizeMod=${sizeMod ? `${sizeMod.enable} mode=${sizeMod.size.mode} v=${sizeMod.size.constant}` : 'null'}`);
            out.push(`ps renderer mode=${ps.renderer.renderMode} vScale=${ps.renderer.velocityScale} lScale=${ps.renderer.lengthScale} mat=${ps.renderer.particleMaterial ? ps.renderer.particleMaterial.name : 'null'}`);
        }
        return out.join(' | ');
    }

    /** 探测编辑器内可用的资源加载方式 */
    async probe(): Promise<string> {
        const out: string[] = [];
        const url = 'assets/Prefab/spaceship/EngineFlame/plasma-core.mtl';
        const uuid = '242db130-ec47-4d87-9195-0c58c1cf04d3';
        const candidates: any[] = [
            'db://assets/Prefab/spaceship/EngineFlame/plasma-core.mtl',
            '/assets/Prefab/spaceship/EngineFlame/plasma-core.mtl',
            url,
            uuid,
            { uuid },
            { url: 'db://assets/Prefab/spaceship/EngineFlame/plasma-core.mtl' },
        ];
        for (const c of candidates) {
            // eslint-disable-next-line no-await-in-loop
            const r = await new Promise<string>((resolve) => {
                assetManager.loadAny(c as any, (err, asset) => {
                    resolve(err ? `ERR:${(err as Error).message.slice(0, 90)}` : `OK:${asset ? asset.constructor.name : 'null'}`);
                });
            });
            out.push(`${JSON.stringify(c)}=>${r}`);
        }
        try {
            const q = await (Editor as any).Message.request('asset-db', 'query-url', { uuid });
            out.push(`query-url=${JSON.stringify(q)}`);
        } catch (e) {
            out.push(`query-url threw ${(e as Error).message}`);
        }
        return out.join(' | ');
    }

    private loadAny<T>(url: string, diag?: string[]): Promise<T | null> {
        return new Promise((resolve) => {
            assetManager.loadAny(url, (err, asset) => {
                if (err || !asset) {
                    const msg = `loadAny(${url}) err=${err ? (err as Error).message : 'null'} asset=${!!asset}`;
                    console.error('[EngineFlameBuilder]', msg);
                    if (diag) diag.push(msg);
                    resolve(null);
                    return;
                }
                if (diag) diag.push(`loadAny(${url}) ok ${asset.constructor.name}`);
                resolve(asset as T);
            });
        });
    }

    /** 从 glb 导入的模型预制件中取出核心网格 */
    private async loadCoreMesh(diag?: string[]): Promise<Mesh | null> {
        // 直接加载 glb 的网格子资源
        const direct = await this.loadAny<Mesh>(`${CORE_MESH_UUID}@4b487`, diag);
        if (direct) return direct;
        // 回退：加载 glb 的场景子资源，再从 MeshRenderer 取网格
        const prefab = await this.loadAny<Prefab>(`${CORE_MESH_UUID}@14bf7`, diag);
        if (!prefab) return null;
        const model = instantiate(prefab);
        const renderer = model.getComponentInChildren(MeshRenderer);
        const mesh = renderer ? renderer.mesh : null;
        model.destroy();
        return mesh;
    }

    private async loadMaterial(url: string, diag?: string[]): Promise<Material | null> {
        return this.loadAny<Material>(url, diag);
    }

    /** 配置动态等离子粒子（单位为 EngineFlame 局部单位，随根节点统一缩放） */
    private configureParticles(node: Node, material: Material): void {
        const ps = node.addComponent(ParticleSystem);
        // duration 必须为有限值，prewarm 才会在 play() 时预跑一整轮发射
        // （duration = -1 时 prewarm 的空转次数为负，不会有任何粒子）
        ps.duration = 1;
        ps.loop = true;
        ps.playOnAwake = true;
        ps.capacity = 120;
        ps.simulationSpeed = 1;
        // prewarm：play() 时立即预跑一次发射，避免火焰刚出现时的冷启动空窗
        ps.prewarm = true;
        // 保持默认 simulationSpace/scaleSpace 均为 Local：
        // 全部参数（尺寸/速度/半径）都走 EngineFlame 局部坐标系，
        // 整棵预制件通过根节点的缩放统一放大，与发光核心网格的行为一致。
        // 注意：scaleSpace=Local 时渲染器用节点的「局部缩放」作尺寸倍率，
        // 因此本节点自身缩放必须保持 1，否则粒子会被缩成亚像素。
        node.setScale(1, 1, 1);

        // 生命周期 0.3~0.7s（TwoConstants = 3）
        ps.startLifetime.mode = 3;
        ps.startLifetime.constantMin = 0.3;
        ps.startLifetime.constantMax = 0.7;

        // 初速度 0.35~0.75（局部单位/秒）
        ps.startSpeed.mode = 3;
        ps.startSpeed.constantMin = 0.35;
        ps.startSpeed.constantMax = 0.75;

        // 粒子尺寸 0.022~0.05（略大于等离子核心直径 0.04/0.022）
        ps.startSizeX.mode = 3;
        ps.startSizeX.constantMin = 0.022;
        ps.startSizeX.constantMax = 0.05;
        ps.startSizeY.mode = 3;
        ps.startSizeY.constantMin = 0.022;
        ps.startSizeY.constantMax = 0.05;
        ps.startSizeZ.mode = 3;
        ps.startSizeZ.constantMin = 0.022;
        ps.startSizeZ.constantMax = 0.05;
        ps.startSize3D = false;

        // 起始颜色：蓝白
        ps.startColor.mode = 0;
        ps.startColor.color = new Color(190, 225, 255, 255);

        // 发射速率 90/s
        ps.rateOverTime.mode = 0;
        ps.rateOverTime.constant = 90;

        // 锥形发射：沿 -Z（飞船后方）喷射，锥半径与喷口内径一致
        const shape = ps.shapeModule;
        shape.enable = true;
        shape.shapeType = 2; // Cone
        shape.radius = 0.014;
        shape.angle = 15;
        shape.radiusThickness = 1;
        shape.length = 0;

        // 颜色随生命周期：蓝白 -> 青蓝 -> 透明
        const colorModule = ps.colorOverLifetimeModule;
        colorModule.enable = true;
        colorModule.color.mode = 1; // Gradient
        const gradient = new Gradient();
        gradient.setKeys(
            [
                { color: new Color(225, 245, 255), time: 0 },
                { color: new Color(110, 190, 255), time: 0.45 },
                { color: new Color(45, 105, 235), time: 1 },
            ],
            [
                { alpha: 1, time: 0 },
                { alpha: 0.8, time: 0.4 },
                { alpha: 0, time: 1 },
            ],
        );
        colorModule.color.gradient = gradient;

        // 尺寸随生命周期收缩，尾端自然消散
        const sizeModule = ps.sizeOvertimeModule;
        sizeModule.enable = true;
        sizeModule.size.mode = 0; // Constant
        sizeModule.size.constant = 0.25;

        // 拉伸公告板：沿运动方向拉长，形成流线（与 1_opening 尾焰一致的参数）
        ps.renderer.renderMode = 1; // StretchedBillboard
        ps.renderer.velocityScale = 0.5;
        ps.renderer.lengthScale = 1.5;

        ps.renderer.cpuMaterial = material;
        ps.setSharedMaterial(material, 0);
    }
}
