import { assetManager, director, ImageAsset, Skybox, Texture2D, TextureCube, warn } from 'cc';

/**
 * 宇宙天空盒目录表：每套宇宙一个目录，目录下六面贴图按 <前缀>_<面>.png 命名
 * （前缀取目录名去掉 cosmos_：default/green/purple/yellow/red/blue）。
 * Debug 宇宙预览面板与 SpaceSkybox 组件共用本表，新增一套宇宙只需在此加一行。
 */
export const COSMOS_LIST: { dir: string; label: string }[] = [
    { dir: 'db://assets/Space/cosmos_default', label: '默认' },
    { dir: 'db://assets/Space/cosmos_green', label: '绿色' },
    { dir: 'db://assets/Space/cosmos_purple', label: '紫色' },
    { dir: 'db://assets/Space/cosmos_yellow', label: '黄色' },
    { dir: 'db://assets/Space/cosmos_red', label: '红色' },
    { dir: 'db://assets/Space/cosmos_blue', label: '蓝色' },
];

/** 从目录名推断六面贴图前缀：.../cosmos_default → default，.../cosmos_green → green */
export function cosmosPrefix(dir: string): string {
    const base = dir.split('/').pop() || '';
    return base.replace(/^cosmos[_-]?/i, '') || 'default';
}

/**
 * 加载指定目录的六面贴图，组装为 TextureCube 并应用为当前场景天空盒。
 * 六面数组顺序必须与 TextureCube.FaceIndex 一致：right,left,top,bottom,front,back。
 * 加载失败仅告警不抛异常（调用方面板可继续操作）。
 */
export function applyCosmosSkybox(dir: string, facePrefix = '', rotationAngle = 0, useIBL = true): void {
    const prefix = facePrefix || cosmosPrefix(dir);
    const faceUrls = [
        `${dir}/${prefix}_right.png`,
        `${dir}/${prefix}_left.png`,
        `${dir}/${prefix}_top.png`,
        `${dir}/${prefix}_bottom.png`,
        `${dir}/${prefix}_front.png`,
        `${dir}/${prefix}_back.png`,
    ];
    assetManager.loadAny(faceUrls, (err, assets) => {
        if (err || !assets || assets.length < 6) {
            warn('[CosmosCatalog] 宇宙天空盒贴图加载失败:', dir, err);
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
            warn('[CosmosCatalog] 当前无活动场景，天空盒设置跳过');
            return;
        }
        let skybox = scene.globals.skybox;
        if (!skybox) {
            skybox = new Skybox();
            scene.globals.skybox = skybox;
        }
        skybox.enabled = true;
        skybox.envmap = cubeMap;
        skybox.useIBL = useIBL;
        skybox.rotationAngle = rotationAngle;
    });
}
