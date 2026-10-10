import { director, game, sys } from 'cc';

/** 统一配置存储的 localStorage key（单 key JSON） */
const STORE_KEY = 'settings_v1';
/** 旧版背景音乐开关的 key（迁移用） */
const LEGACY_BGM_KEY = 'bgm_enabled';

/** 配置项结构 */
export interface SettingsData {
    /** 背景音乐开关 */
    bgmEnabled: boolean;
    /** 背景音乐音量 0~1 */
    bgmVolume: number;
    /** 目标帧率 */
    frameRate: number;
    /** 渲染分辨率比例（画质档位） */
    shadingScale: number;
}

const DEFAULTS: SettingsData = {
    bgmEnabled: true,
    bgmVolume: 0.6,
    frameRate: 60,
    shadingScale: 1.0,
};

/**
 * 全局设置存储：所有配置统一序列化到 localStorage 的一个 key 里。
 * 读取方：MusicManager（音量/开关）、Settings 场景（三组配置行）、Home（启动时应用画质）。
 */
export class SettingsStore {
    /** 读取整包配置（坏数据时回退默认值） */
    public static load(): SettingsData {
        const raw = sys.localStorage.getItem(STORE_KEY);
        if (!raw) {
            // 首次迁移：把旧版 bgm_enabled 合并进默认值
            const legacy = sys.localStorage.getItem(LEGACY_BGM_KEY);
            return { ...DEFAULTS, bgmEnabled: legacy !== '0' };
        }
        try {
            return { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {
            return { ...DEFAULTS };
        }
    }

    /** 读取单项配置 */
    public static get<K extends keyof SettingsData>(key: K): SettingsData[K] {
        return SettingsStore.load()[key];
    }

    /** 写入单项配置（读-改-写整包） */
    public static set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
        const data = SettingsStore.load();
        data[key] = value;
        sys.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    }

    /**
     * 应用画质与帧率配置到引擎（进场景/启动时调用）。
     * 注意：web 端窗口 resize 会把 shadingScale 重置为 1（screen.ts 的 resolutionScale 覆盖），
     * 本期不做 resize 监听，重进设置场景或重启后会自动恢复配置值。
     */
    public static applyGraphics(): void {
        const data = SettingsStore.load();
        game.frameRate = data.frameRate;
        // PipelineRuntime 类型声明未含 shadingScale，实际实现见引擎 render-pipeline.ts
        const pipeline = director.root?.pipeline as unknown as { shadingScale?: number } | null;
        if (pipeline && typeof pipeline.shadingScale === 'number') {
            pipeline.shadingScale = data.shadingScale;
        }
    }
}
