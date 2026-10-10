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
    sys,
} from 'cc';

const { ccclass } = _decorator;

/** 背景音乐开关的全局配置键（localStorage 持久化） */
const BGM_CONFIG_KEY = 'bgm_enabled';

/**
 * 全局背景音乐管理器：
 * - init() 后挂到常驻节点，跨场景持续播放
 * - 开关状态存入 localStorage（全局配置），每次进页面都会读取校正
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

    private bgmOn = true;
    private clipLoaded = false;
    private audioSource: AudioSource | null = null;

    onLoad(): void {
        this.audioSource = this.node.addComponent(AudioSource);
        // 必须关闭：默认 true 时跨场景重新挂载会触发自动播放，绕过开关状态
        this.audioSource.playOnAwake = false;
        this.audioSource.loop = true;
        this.audioSource.volume = 0.6;

        this.bgmOn = MusicManager.readConfig();
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
        MusicManager.writeConfig(this.bgmOn);
        if (this.bgmOn) this.playSafely();
        else this.audioSource?.stop();
        return this.bgmOn;
    }

    /** 以全局配置为准校正播放状态（进页面时调用） */
    private syncFromConfig(): void {
        const on = MusicManager.readConfig();
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

    private static readConfig(): boolean {
        return sys.localStorage.getItem(BGM_CONFIG_KEY) !== '0';
    }

    private static writeConfig(on: boolean): void {
        sys.localStorage.setItem(BGM_CONFIG_KEY, on ? '1' : '0');
    }
}
