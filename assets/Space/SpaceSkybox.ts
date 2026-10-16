import {
    _decorator,
    Component,
    assetManager,
    director,
    ImageAsset,
    Skybox,
    Texture2D,
    TextureCube,
    warn,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 宇宙天空盒组件：把一套六面贴图（默认 cosmos1）在运行时组装成 TextureCube，
 * 并挂到场景 globals.skybox 作为宇宙背景盒。
 * 任意场景挂上本组件即可获得整套宇宙背景；把 skyboxDir 换成 cosmos2 等目录
 * 即可整体切换背景（目录下须含 right/left/top/bottom/front/back 六张同名贴图）。
 *
 * 六面命名与朝向约定（TextureCube.FaceIndex）：
 *   right=0(+X) left=1(-X) top=2(+Y) bottom=3(-Y) front=4(+Z) back=5(-Z)
 */
@ccclass('SpaceSkybox')
export class SpaceSkybox extends Component {
    /** 六面贴图目录（db:// 资源 URL），换目录即整套切换宇宙背景 */
    @property
    skyboxDir = 'db://assets/Space/cosmos1';

    /** 天空盒旋转角（度），微调银河带朝向 */
    @property
    rotationAngle = 0;

    /** 是否用星空贴图提供环境光照（IBL），影响 PBR 材质的环境反射 */
    @property
    useIBL = true;

    onLoad(): void {
        this.buildSkybox();
    }

    /** 加载六面贴图 → 逐个包成 Texture2D → 组装 TextureCube → 设为场景天空盒 */
    private buildSkybox(): void {
        const dir = this.skyboxDir.replace(/\/+$/, '');
        // 数组顺序必须与 TextureCube.FaceIndex 一致：right,left,top,bottom,front,back
        const faceUrls = [
            `${dir}/right.png`,
            `${dir}/left.png`,
            `${dir}/top.png`,
            `${dir}/bottom.png`,
            `${dir}/front.png`,
            `${dir}/back.png`,
        ];
        assetManager.loadAny(faceUrls, (err, assets) => {
            if (err || !assets || assets.length < 6) {
                warn('[SpaceSkybox] 宇宙天空盒贴图加载失败:', err);
                return;
            }
            const textures: Texture2D[] = (assets as ImageAsset[]).map((image) => {
                const texture = new Texture2D();
                texture.image = image;
                return texture;
            });
            const cubeMap = TextureCube.fromTexture2DArray(textures);
            const scene = director.getScene();
            if (!scene) {
                warn('[SpaceSkybox] 当前无活动场景，天空盒设置跳过');
                return;
            }
            let skybox = scene.globals.skybox;
            if (!skybox) {
                skybox = new Skybox();
                scene.globals.skybox = skybox;
            }
            skybox.enabled = true;
            skybox.envmap = cubeMap;
            skybox.useIBL = this.useIBL;
            skybox.rotationAngle = this.rotationAngle;
        });
    }
}
