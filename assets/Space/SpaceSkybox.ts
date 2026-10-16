import { _decorator, Component } from 'cc';
import { applyCosmosSkybox } from './CosmosCatalog';

const { ccclass, property } = _decorator;

/**
 * 宇宙天空盒组件：把一套六面贴图（默认 cosmos_default）在运行时组装成 TextureCube，
 * 并挂到场景 globals.skybox 作为宇宙背景盒。
 * 任意场景挂上本组件即可获得整套宇宙背景；把 skyboxDir 换成 cosmos_green 等目录
 * 即可整体切换背景（目录下须含 <前缀>_right/left/top/bottom/front/back 六张贴图，
 * 前缀留空时按目录名推断：cosmos_default → default，cosmos_green → green）。
 *
 * 组装逻辑与 Debug 宇宙预览面板共用 CosmosCatalog.applyCosmosSkybox。
 * 六面命名与朝向约定（TextureCube.FaceIndex）：
 *   right=0(+X) left=1(-X) top=2(+Y) bottom=3(-Y) front=4(+Z) back=5(-Z)
 */
@ccclass('SpaceSkybox')
export class SpaceSkybox extends Component {
    /** 六面贴图目录（db:// 资源 URL），换目录即整套切换宇宙背景 */
    @property
    skyboxDir = 'db://assets/Space/cosmos_default';

    /** 六面贴图文件名前缀（留空则从目录名推断：cosmos_default → default） */
    @property
    facePrefix = '';

    /** 天空盒旋转角（度），微调银河带朝向 */
    @property
    rotationAngle = 0;

    /** 是否用星空贴图提供环境光照（IBL），影响 PBR 材质的环境反射 */
    @property
    useIBL = true;

    onLoad(): void {
        this.buildSkybox();
    }

    /** 按当前属性组装并应用宇宙天空盒（换 skyboxDir 后也可手动调用刷新） */
    buildSkybox(): void {
        applyCosmosSkybox(this.skyboxDir, this.facePrefix, this.rotationAngle, this.useIBL);
    }
}
