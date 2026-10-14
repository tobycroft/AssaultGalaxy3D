import { _decorator, Component, director, Node, Vec3, Color, Label, UITransform, Graphics, UIOpacity } from 'cc';
import { fadeIn, fadeOutThen } from '../../Common/UIAnim';
import { TechText } from '../../Common/TechUI';
import { preheatModels } from '../ModelPreheater';
import { markIntroPlayed } from '../BootFlow';

const { ccclass } = _decorator;

/** 游戏名称（Intro 主标题） */
const GAME_NAME = 'ASSAULT GALAXY 3D';
/** 开场延迟（秒）：留出黑场过渡再开始打字 */
const INTRO_DELAY = 0.5;
/** 打字机每个字符出现间隔（秒） */
const TYPE_INTERVAL = 0.07;
/** 背景装饰星点数量 */
const STAR_COUNT = 30;

/**
 * 游戏开场 Intro：游戏启动时的第一个场景。
 * 第一阶段：进度条显式展示模型预热加载（百分比 + 青色填充条）；
 * 第二阶段：加载完成后打字机动画登场，最后出现点击继续，点击屏幕淡出进入首页
 * （未登录由 Home 自动跳转登录页）。加载完成前点击不生效。
 */
@ccclass('Intro')
export class Intro extends Component {
    /** 主标题 Label（打字机效果） */
    private titleLabel: Label | null = null;
    /** 副装饰线（打字完成后展开） */
    private subLine: Node | null = null;
    /** 底部提示的透明度组件（update 驱动淡入与呼吸） */
    private tipOpacity: UIOpacity | null = null;
    /** 阶段计时器（秒） */
    private elapsed = 0;
    /** 已显示的字符数 */
    private typedCount = 0;
    /** 打字是否完成 */
    private typedDone = false;
    /** 打字完成后经过时间（驱动副线与提示登场；-1 表示未开始） */
    private tipElapsed = -1;
    /** 是否已触发退出（防重复点击） */
    private leaving = false;
    /** 模型预热是否完成（完成前不启动动画、点击不生效） */
    private preheatDone = false;

    /** 进度条节点引用 */
    private loadingRoot: Node | null = null;
    /** 进度条填充 Graphics（按进度重绘） */
    private barFill: Graphics | null = null;
    /** 进度百分比文字 */
    private barLabel: Label | null = null;
    /** 已绘制的进度（0~1），避免同值重绘 */
    private drawnProgress = -1;

    start(): void {
        // 记录本次运行 Intro 已播放（Home 据此不再重定向回来）
        markIntroPlayed();

        this.buildBackground();
        this.buildLoading();

        // 先预热模型（进度条驱动），完成后才启动开场动画
        preheatModels(
            (loaded, total) => this.onPreheatProgress(loaded, total),
            () => this.onPreheatDone(),
        );
    }

    update(dt: number): void {
        if (!this.preheatDone) return;
        this.elapsed += dt;

        // 打字机：延迟后逐字显示游戏名
        if (!this.typedDone && this.titleLabel) {
            const n = Math.max(0, Math.min(GAME_NAME.length, Math.floor((this.elapsed - INTRO_DELAY) / TYPE_INTERVAL)));
            if (n !== this.typedCount) {
                this.typedCount = n;
                this.titleLabel.string = GAME_NAME.slice(0, this.typedCount);
            }
            if (this.typedCount >= GAME_NAME.length) {
                this.typedDone = true;
                this.tipElapsed = 0;
                // 副装饰线展开
                if (this.subLine) fadeIn(this.subLine, new Vec3(0, 10, 0), 0.1);
            }
        }

        // 打字完成后：副线展开（上面已触发），提示先淡入再呼吸，全部由这里驱动，
        // 避免 fadeIn 的 tween 与手动写值相互冲突
        if (this.tipElapsed >= 0 && this.tipOpacity) {
            this.tipElapsed += dt;
            if (this.tipElapsed < 0.3) {
                this.tipOpacity.opacity = Math.round(255 * (this.tipElapsed / 0.3));
            } else {
                this.tipOpacity.opacity = 150 + Math.round(105 * Math.sin((this.tipElapsed - 0.3) * 3));
            }
        }
    }

    // ==================== 第一阶段：加载进度 ====================

    /** 构建进度条 UI：说明文字 + 轨道 + 填充 + 百分比 */
    private buildLoading(): void {
        const root = new Node('Loading');
        root.layer = this.node.layer;
        root.setPosition(0, -20, 0);
        root.addComponent(UITransform).setContentSize(560, 80);
        this.node.addChild(root);
        this.loadingRoot = root;

        // 说明文字
        const cap = new Node('Caption');
        cap.layer = this.node.layer;
        cap.setPosition(0, 24, 0);
        cap.addComponent(UITransform).setContentSize(560, 30);
        const cl = cap.addComponent(Label);
        cl.string = '星图数据同步中…';
        cl.fontSize = 22;
        cl.color = TechText.dim;
        cl.horizontalAlign = Label.HorizontalAlign.CENTER;
        cl.verticalAlign = Label.VerticalAlign.CENTER;
        root.addChild(cap);

        // 进度轨道（深色圆角槽 + 青色描边）
        const track = new Node('Track');
        track.layer = this.node.layer;
        track.addComponent(UITransform).setContentSize(520, 16);
        const tg = track.addComponent(Graphics);
        tg.fillColor = new Color(11, 24, 43, 245);
        tg.roundRect(-260, -8, 520, 16, 8);
        tg.fill();
        tg.strokeColor = new Color(0, 190, 230, 220);
        tg.lineWidth = 2;
        tg.roundRect(-260, -8, 520, 16, 8);
        tg.stroke();
        root.addChild(track);

        // 填充条：独立子节点，按进度整体缩放（圆角随缩放形变，故用固定宽+遮罩式裁剪）
        const fill = new Node('Fill');
        fill.layer = this.node.layer;
        fill.addComponent(UITransform).setContentSize(516, 12);
        const fg = fill.addComponent(Graphics);
        fg.fillColor = new Color(0, 214, 255, 255);
        fg.roundRect(-258, -6, 516, 12, 6);
        fg.fill();
        // 用锚点左对齐：初始缩放 0 表示 0%，重绘宽度实现进度
        fill.setPosition(0, 0, 0);
        track.addChild(fill);
        this.barFill = fg;

        // 百分比
        const pct = new Node('Percent');
        pct.layer = this.node.layer;
        pct.setPosition(0, -32, 0);
        pct.addComponent(UITransform).setContentSize(200, 28);
        const pl = pct.addComponent(Label);
        pl.string = '0%';
        pl.fontSize = 20;
        pl.color = TechText.caption;
        pl.horizontalAlign = Label.HorizontalAlign.CENTER;
        pl.verticalAlign = Label.VerticalAlign.CENTER;
        root.addChild(pct);
        this.barLabel = pl;
    }

    /** 预热进度回调：重绘填充条与百分比文字 */
    private onPreheatProgress(loaded: number, total: number): void {
        const p = total > 0 ? loaded / total : 1;
        if (Math.abs(p - this.drawnProgress) < 0.005) return;
        this.drawnProgress = p;
        const w = Math.round(516 * p);
        if (this.barFill) {
            this.barFill.clear();
            if (w > 0) {
                this.barFill.fillColor = new Color(0, 214, 255, 255);
                this.barFill.roundRect(-258, -6, w, 12, 6);
                this.barFill.fill();
            }
        }
        if (this.barLabel) this.barLabel.string = `${Math.round(p * 100)}%`;
    }

    /** 预热完成：撤掉进度条，启动开场动画并开放点击继续 */
    private onPreheatDone(): void {
        if (this.preheatDone) return;
        this.preheatDone = true;
        this.onPreheatProgress(1, 1);

        // 进度条淡出后移除，再启动打字机动画
        const root = this.loadingRoot;
        const startAnim = (): void => {
            if (root && root.isValid) root.destroy();
            this.loadingRoot = null;
            this.buildDecoLine();
            this.buildTitle();
            this.buildTip();
            // 点击任意处继续（打字中也可点击跳过等待）
            this.node.on(Node.EventType.TOUCH_END, () => this.leave(), this);
        };
        if (root) fadeOutThen(root, 0.3, startAnim);
        else startAnim();
    }

    /** 深色星空背景：纯色底 + 随机星点 */
    private buildBackground(): void {
        const bg = new Node('Background');
        bg.layer = this.node.layer;
        bg.addComponent(UITransform).setContentSize(1280, 720);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(8, 14, 26, 255);
        g.fillRect(-640, -360, 1280, 720);
        // 星点：确定性分布（避免每帧随机），大小/透明度各异
        for (let i = 0; i < STAR_COUNT; i++) {
            const x = ((i * 733) % 1213) - 640 + (i % 5) * 9;
            const y = ((i * 397) % 661) - 360 + (i % 7) * 11;
            const s = i % 3 === 0 ? 3 : 2;
            g.fillColor = new Color(200, 225, 255, i % 4 === 0 ? 200 : 120);
            g.fillRect(x, y, s, s);
        }
        this.node.addChild(bg);
    }

    /** 标题上方装饰线（青色横条，上浮淡入） */
    private buildDecoLine(): void {
        const n = new Node('DecoLine');
        n.layer = this.node.layer;
        n.setPosition(0, 150, 0);
        n.addComponent(UITransform).setContentSize(360, 3);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(0, 214, 255, 255);
        g.roundRect(-180, -1.5, 360, 3, 1.5);
        g.fill();
        this.node.addChild(n);
        fadeIn(n, new Vec3(0, 20, 0), 0.2);
    }

    /** 主标题：游戏名称（打字机逐字显示，初始为空串） */
    private buildTitle(): void {
        const n = new Node('Title');
        n.layer = this.node.layer;
        n.setPosition(0, 50, 0);
        n.addComponent(UITransform).setContentSize(1100, 90);
        const l = n.addComponent(Label);
        l.string = '';
        l.fontSize = 64;
        l.lineHeight = 80;
        l.color = TechText.bright;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(n);
        this.titleLabel = l;
    }

    /** 副装饰线 + 底部提示（打字完成后依次登场） */
    private buildTip(): void {
        // 副装饰线：标题下方短亮条，打字完成后展开
        const line = new Node('SubLine');
        line.layer = this.node.layer;
        line.setPosition(0, -20, 0);
        line.addComponent(UITransform).setContentSize(120, 3);
        const lg = line.addComponent(Graphics);
        lg.fillColor = TechText.caption;
        lg.roundRect(-60, -1.5, 120, 3, 1.5);
        lg.fill();
        this.node.addChild(line);
        this.subLine = line;

        // 底部提示
        const tip = new Node('Tip');
        tip.layer = this.node.layer;
        tip.setPosition(0, -250, 0);
        tip.addComponent(UITransform).setContentSize(600, 40);
        const tl = tip.addComponent(Label);
        tl.string = '点 击 继 续';
        tl.fontSize = 24;
        tl.color = TechText.dim;
        tl.horizontalAlign = Label.HorizontalAlign.CENTER;
        tl.verticalAlign = Label.VerticalAlign.CENTER;
        this.node.addChild(tip);
        // 呼吸由 update 驱动，这里先拿住 UIOpacity（初始透明，完成后渐显）
        this.tipOpacity = tip.addComponent(UIOpacity);
        this.tipOpacity.opacity = 0;
    }

    /** 退出 Intro：整体淡出后进入首页（未登录时由 Home 自动跳转登录页） */
    private leave(): void {
        if (this.leaving) return;
        this.leaving = true;
        fadeOutThen(this.node, 0.4, () => director.loadScene('Home'));
    }
}
