import { assetManager, director, ImageAsset, Skybox, Texture2D, TextureCube, warn } from 'cc';

/**
 * 一套宇宙天空盒定义：目录（仅标识用）+ 按钮标签 + 六面贴图资源 UUID。
 * Debug 宇宙预览面板与 SpaceSkybox 组件共用本表，新增一套宇宙只需在此加一行
 * （uuid 取自各贴图 .meta 文件，重命名文件不会变）。
 */
export interface CosmosDef {
    /** 六面贴图目录（db:// 资源 URL，仅作标识与兜底提示用） */
    dir: string;
    /** 面板按钮短标签 */
    label: string;
    /**
     * 六面贴图资源 UUID，顺序必须与 TextureCube.FaceIndex 一致：
     * right=0(+X) left=1(-X) top=2(+Y) bottom=3(-Y) front=4(+Z) back=5(-Z)
     */
    faces: string[];
}

export const COSMOS_LIST: CosmosDef[] = [
    {
        dir: 'db://assets/Skybox/cosmos_default',
        label: '默认',
        faces: [
            '97d2881b-1562-4981-9e8e-abfbd2077fbc', // right
            'fb2f8c7c-2ff5-489c-9910-3d8429bed651', // left
            '9ed7a01d-7569-4cac-8d58-ecc879337623', // top
            '1b44dfa8-c539-4953-b9d5-9ecb1a90e37a', // bottom
            '373fb6b9-1c34-4992-b4d8-058f3a4039fb', // front
            'dbae974e-8133-455e-ab0b-7af4f903da66', // back
        ],
    },
    {
        dir: 'db://assets/Skybox/cosmos_green',
        label: '绿色',
        faces: [
            'aa23a73b-44c9-44c1-8882-1ea106c96b02', // right
            '962cd27a-4f49-4272-b7aa-ff4ebb709ebc', // left
            'a2eae438-ebfa-4585-931e-85f733c4b1aa', // top
            '20ba1ad1-0abc-4b54-a5d1-8396a9ce310a', // bottom
            '335ed5fd-1b88-4805-b5db-d8f5ad0be9c0', // front
            '380181a4-230e-4c9f-8eeb-fb75369574c7', // back
        ],
    },
    {
        dir: 'db://assets/Skybox/cosmos_purple',
        label: '紫色',
        faces: [
            '21c64449-c39d-4890-946f-0ed5987bbb02', // right
            '6af5ca4f-0c19-4efe-b3ee-5769d3be292f', // left
            '8fac24cc-363f-4fd7-93be-521ba62339eb', // top
            '8a2f71e1-af8a-4254-8d7d-aa09686910f6', // bottom
            '1f2c5754-1949-45c8-b25c-15d45ea6ed21', // front
            '77f67bd3-ea6b-437f-bc78-eab43a5d9d59', // back
        ],
    },
    {
        dir: 'db://assets/Skybox/cosmos_yellow',
        label: '黄色',
        faces: [
            'd6d0a333-87f7-4849-bed7-cae17e7350dd', // right
            '1b981f37-2f73-4f53-8a99-720ae1a81a1b', // left
            'fbbe1d78-0d6d-438e-b5df-e09237ef08e9', // top
            'a192c78a-2006-4ebe-b953-c03f68692397', // bottom
            '1d79fcf4-70c3-401f-8fc3-46155aab4abc', // front
            'ecd225d1-9193-45dc-b6b0-1e36403ba8ca', // back
        ],
    },
    {
        dir: 'db://assets/Skybox/cosmos_red',
        label: '红色',
        faces: [
            'da8d9eaa-754e-4f1b-80b6-04f2dc142034', // right
            'd170f96d-4011-42f3-a57c-fa555add8f8e', // left
            'ef9cca52-226b-4ae9-9472-323f94f2fbd4', // top
            '714ee8f5-9c5b-4cef-81d9-48bd69fcb9de', // bottom
            'c6563ec6-8c99-4af0-98fd-7340cb2b8111', // front
            'a678d8c8-ac1f-48c1-92a0-0bb268c0b942', // back
        ],
    },
    {
        dir: 'db://assets/Skybox/cosmos_blue',
        label: '蓝色',
        faces: [
            '17a7ae8c-6838-4376-9597-45830dd7ce14', // right
            'bce2e288-31c5-4e0e-b27b-1d48895b890a', // left
            '54a3801e-321a-4a81-8bea-00698f2e5f92', // top
            'cf05a23b-843a-4f0a-a171-d948a6117784', // bottom
            'a2a9c1d4-a833-4539-99ac-7873c85ec7a8', // front
            '747c2a3a-c79e-4024-8a5b-ba7aab9b8b6d', // back
        ],
    },
];

/** 按目录查找宇宙定义（找不到返回 null） */
export function findCosmos(dir: string): CosmosDef | null {
    return COSMOS_LIST.find((c) => c.dir === dir) ?? null;
}

/**
 * 应用一套宇宙天空盒：按 UUID 加载六面贴图，运行时组装 TextureCube。
 *
 * 注意：运行时必须用资源 UUID（{ uuid } 对象形式）加载——db:// 编辑器 URL 不被解析，
 * 会拼出 /assets/general/import/db/db://... 导致 404。
 *
 * 加载失败仅告警不抛异常（调用方面板可继续操作）。
 */
export function applyCosmosSkybox(def: CosmosDef, rotationAngle = 0, useIBL = true): void {
    if (!def.faces || def.faces.length < 6) {
        warn('[CosmosCatalog] 宇宙定义缺少 faces:', def.dir);
        return;
    }
    // 与项目内其他资源加载一致，用 { uuid } 对象形式（运行时唯一可靠方式）
    const requests = def.faces.map((uuid) => ({ uuid }));
    assetManager.loadAny(requests, (err, assets) => {
        if (err || !assets || assets.length < 6) {
            warn('[CosmosCatalog] 宇宙天空盒贴图加载失败:', def.dir, err);
            return;
        }
        const textures: Texture2D[] = (assets as ImageAsset[]).map((image) => {
            const texture = new Texture2D();
            texture.image = image;
            return texture;
        });
        setSceneSkybox(TextureCube.fromTexture2DArray(textures), rotationAngle, useIBL);
    });
}

/** 把组装/加载好的 TextureCube 设为当前场景天空盒 */
function setSceneSkybox(cubeMap: TextureCube, rotationAngle: number, useIBL: boolean): void {
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
}
