import {
    _decorator,
    Component,
    director,
    input,
    Input,
    Node,
    AudioSource,
    AudioClip,
    resources,
} from 'cc';
import { SettingsStore } from './SettingsStore';

const { ccclass } = _decorator;

/**
 * 全局背景音乐管理器：
 * - init() 后挂到常驻节点，跨场景持续播放
 * - 开关与音量统一存入 SettingsStore（localStorage），每次进页面都会读取校正
 * - 音乐文件位于 resources/Music/bg
 * - 浏览器自动播放策略可能拦截首次播放，首次触摸时会自动尝试恢复
 */
@ccclass('MusicManager')
export class MusicManager extends Component {
    private static instance: MusicManager | null = null;

    /** 获取实例（未初始化时为 null） */
    public static get(): MusicManager | null {
        return MusicManager.instance;
    }

    /**
     * 幂等初始化：创建常驻节点并按全局配置开始播放。
     * 常驻节点已存在时，以存储配置为准校正播放状态。
     */
    public static init(): void {
        if (MusicManager.instance) {
            MusicManager.instance.syncFromConfig();
            return;
        }
        const scene = director.getScene();
        if (!scene) return;
        const node = new Node('MusicManager');
        scene.addChild(node);
        director.addPersistRootNode(node);
        MusicManager.instance = node.addComponent(MusicManager);
    }

    /** 当前是否开启 */
    public get isOn(): boolean {
        return this.bgmOn;
    }

    /** 当前音量 0~1 */
    public get volume(): number {
        return this.audioSource?.volume ?? SettingsStore.get('bgmVolume');
    }

    private bgmOn = true;
    private clipLoaded = false;
    private audioSource: AudioSource | null = null;

    onLoad(): void {
        this.audioSource = this.node.addComponent(AudioSource);
        // 必须关闭：默认 true 时跨场景重新挂载会触发自动播放，绕过开关状态
        this.audioSource.playOnAwake = false;
        this.audioSource.loop = true;
        this.audioSource.volume = SettingsStore.get('bgmVolume');

        this.bgmOn = SettingsStore.get('bgmEnabled');
        resources.load('Music/bg', AudioClip, (err, clip) => {
            if (err || !clip) {
                console.error('[Music] 背景音乐加载失败:', err);
                return;
            }
            this.clipLoaded = true;
            this.audioSource!.clip = clip;
            if (this.bgmOn) this.playSafely();
        });
        // 浏览器自动播放策略：首次用户触摸后才能真正出声，这里补一次恢复
        input.on(Input.EventType.TOUCH_START, this.tryResume, this);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.tryResume, this);
    }

    /** 切换开关并写入全局配置，返回切换后是否开启 */
    public toggle(): boolean {
        this.bgmOn = !this.bgmOn;
        SettingsStore.set('bgmEnabled', this.bgmOn);
        if (this.bgmOn) this.playSafely();
        else this.audioSource?.stop();
        return this.bgmOn;
    }

    /** 设置音量（0~1）并持久化，供设置场景调用 */
    public setVolume(v: number): void {
        const volume = Math.min(1, Math.max(0, v));
        SettingsStore.set('bgmVolume', volume);
        if (this.audioSource) this.audioSource.volume = volume;
    }

    /** 以全局配置为准校正播放状态（进页面时调用） */
    private syncFromConfig(): void {
        const on = SettingsStore.get('bgmEnabled');
        if (on === this.bgmOn) return;
        this.bgmOn = on;
        if (on) this.playSafely();
        else this.audioSource?.stop();
    }

    private tryResume(): void {
        if (this.bgmOn && this.clipLoaded) this.playSafely();
    }

    private playSafely(): void {
        if (this.audioSource && !this.audioSource.playing) {
            this.audioSource.play();
        }
    }
}
