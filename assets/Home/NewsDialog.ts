import {
    _decorator, BlockInputEvents, Color, Component, EventMouse, Graphics, HorizontalTextAlignment, Label, Mask, MaskType,
    Node, UITransform, Vec3,
} from 'cc';
import { newsDetail, newsList, NewsItem } from '../Common/Api';
import { fadeIn, pressEffect } from '../Common/UIAnim';
import { paintTechButton, paintTechInput, paintTechPanel, TechText } from '../Common/TechUI';

const { ccclass } = _decorator;

/** 列表每页条数（小窗口内 6 条刚好免滚动） */
const PAGE_SIZE = 6;
/** 弹窗面板尺寸 */
const PANEL_W = 760;
const PANEL_H = 560;

/**
 * 新闻公告弹窗（纯代码自绘，无 Prefab）。
 * 列表页：标题 + 摘要 + 发布日期，点击进入详情；底部上一页/下一页翻页。
 * 详情页：标题 + 富文本正文（转纯文本）+ 鼠标滚轮/触摸拖拽滚动，支持返回列表。
 * 打开方式：NewsDialog.open(canvas)；重复打开自动忽略，点击遮罩或 × 关闭。
 */
@ccclass('NewsDialog')
export class NewsDialog extends Component {
    private panel: Node | null = null;
    private listLayer: Node | null = null;
    private detailLayer: Node | null = null;
    private page = 1;
    private pageCount = 1;

    /** 在 canvas 上打开新闻弹窗（已打开则忽略），返回组件实例 */
    public static open(canvas: Node): NewsDialog | null {
        if (canvas.getChildByName('NewsDialog')) return null;
        const root = new Node('NewsDialog');
        root.layer = canvas.layer;
        canvas.addChild(root);
        const dlg = root.addComponent(NewsDialog);
        dlg.build(canvas.layer);
        dlg.loadList(1);
        fadeIn(dlg.panel!, new Vec3(0, -24, 0), 0, 0.22);
        return dlg;
    }

    /** 构建弹窗骨架：遮罩 + 面板 + 标题栏 + 列表/详情两个视图层 */
    private build(layer: number): void {
        // 半透明遮罩：点击遮罩关闭
        const mask = new Node('Mask');
        mask.layer = layer;
        mask.addComponent(UITransform).setContentSize(1280, 720);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 160);
        mg.fillRect(-640, -360, 1280, 720);
        mask.on(Node.EventType.TOUCH_END, () => this.close(), this);
        this.node.addChild(mask);

        // 面板
        const panel = new Node('Panel');
        panel.layer = layer;
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        paintTechPanel(panel.addComponent(Graphics), PANEL_W, PANEL_H);
        // 拦截面板内点击，避免触摸事件穿透到背后的全屏遮罩导致误关闭
        panel.addComponent(BlockInputEvents);
        this.node.addChild(panel);
        this.panel = panel;

        // 标题栏
        this.createLabel(panel, 'Title', '新闻公告', -PANEL_W / 2 + 76, PANEL_H / 2 - 40, 30, TechText.bright, Label.HorizontalAlign.LEFT);

        // 关闭按钮（×）
        const closeBtn = this.createRoundBtn(panel, 'BtnClose', '×', PANEL_W / 2 - 40, PANEL_H / 2 - 38, 44, 44, () => this.close(), 'ghost');
        const closeLab = closeBtn.getChildByName('Label')?.getComponent(Label);
        if (closeLab) closeLab.fontSize = 30;

        // 分隔线
        const sep = new Node('Sep');
        sep.layer = layer;
        sep.addComponent(UITransform).setContentSize(PANEL_W - 64, 2);
        const sg = sep.addComponent(Graphics);
        sg.fillColor = new Color(0, 190, 230, 90);
        sg.roundRect(-(PANEL_W - 64) / 2, -1, PANEL_W - 64, 2, 1);
        sg.fill();
        sep.setPosition(0, PANEL_H / 2 - 72, 0);
        panel.addChild(sep);

        // 列表层 / 详情层（互斥显示）
        this.listLayer = new Node('ListLayer');
        this.listLayer.layer = layer;
        this.listLayer.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H - 100);
        panel.addChild(this.listLayer);

        this.detailLayer = new Node('DetailLayer');
        this.detailLayer.layer = layer;
        this.detailLayer.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H - 100);
        this.detailLayer.active = false;
        panel.addChild(this.detailLayer);
    }

    // ==================== 列表页 ====================

    /** 拉取并渲染指定页的新闻列表 */
    private loadList(page: number): void {
        const layer = this.listLayer;
        if (!layer) return;
        layer.removeAllChildren();
        this.detailLayer!.active = false;
        layer.active = true;
        this.showTip(layer, '加载中…');

        newsList(page, PAGE_SIZE)
            .then((res) => {
                if (this.listLayer !== layer || !layer.isValid) return;
                layer.removeAllChildren();
                if (res.code !== 0 || !res.data || !Array.isArray(res.data.list)) {
                    this.showTip(layer, res.echo || '新闻加载失败');
                    return;
                }
                this.page = res.data.page;
                this.pageCount = Math.max(1, Math.ceil(res.data.total / PAGE_SIZE));
                this.renderList(layer, res.data.list);
            })
            .catch(() => {
                if (this.listLayer !== layer || !layer.isValid) return;
                layer.removeAllChildren();
                this.showTip(layer, '网络异常，请稍后重试');
            });
    }

    /** 渲染列表条目 + 底部分页 */
    private renderList(layer: Node, list: NewsItem[]): void {
        if (list.length === 0) {
            this.showTip(layer, '暂无新闻');
            return;
        }
        const rowH = 62;
        const gap = 8;
        const top = (PANEL_H - 100) / 2 - 30;
        list.forEach((item, i) => {
            this.createNewsRow(layer, item, top - i * (rowH + gap), rowH);
        });

        // 分页：仅多于一页时显示
        if (this.pageCount > 1) {
            const y = -((PANEL_H - 100) / 2) + 34;
            const prev = this.createRoundBtn(layer, 'BtnPrev', '上一页', -140, y, 120, 44,
                () => { if (this.page > 1) this.loadList(this.page - 1); }, 'ghost');
            if (this.page <= 1) this.setBtnEnabled(prev, false);
            const next = this.createRoundBtn(layer, 'BtnNext', '下一页', 140, y, 120, 44,
                () => { if (this.page < this.pageCount) this.loadList(this.page + 1); }, 'ghost');
            if (this.page >= this.pageCount) this.setBtnEnabled(next, false);
            this.createLabel(layer, 'PageInfo', `${this.page} / ${this.pageCount}`, 0, y, 20, TechText.dim);
        }
    }

    /** 单条新闻行：标题 + 摘要 + 日期，点击进入详情 */
    private createNewsRow(parent: Node, item: NewsItem, y: number, h: number): void {
        const layer = this.listLayer!.layer;
        const w = PANEL_W - 100;
        const row = new Node('NewsRow');
        row.layer = layer;
        row.addComponent(UITransform).setContentSize(w, h);
        paintTechInput(row.addComponent(Graphics), w, h);
        row.setPosition(0, y, 0);
        parent.addChild(row);

        // 标题（左上）+ 日期（右上）+ 摘要（下方暗色）
        this.createLabel(row, 'Title', this.clip(item.title, 20), -w / 2 + 20, 11, 22, TechText.primary, Label.HorizontalAlign.LEFT, w - 140);
        this.createLabel(row, 'Date', this.formatDate(item.publish_time), w / 2 - 60, 11, 18, TechText.dim, Label.HorizontalAlign.RIGHT, 110);
        this.createLabel(row, 'Summary', this.clip(item.summary, 32), -w / 2 + 20, -13, 18, TechText.dim, Label.HorizontalAlign.LEFT, w - 40);

        row.on(Node.EventType.TOUCH_END, () => this.loadDetail(item.id), this);
        pressEffect(row, 0.98);
    }

    // ==================== 详情页 ====================

    /** 拉取新闻详情并切到详情视图 */
    private loadDetail(id: number): void {
        const layer = this.detailLayer;
        if (!layer) return;
        this.listLayer!.active = false;
        layer.removeAllChildren();
        layer.active = true;

        // 顶部：返回 + 转圈提示
        this.createRoundBtn(layer, 'BtnBack', '返回', -PANEL_W / 2 + 60, (PANEL_H - 100) / 2 - 30, 96, 42,
            () => this.loadList(this.page), 'ghost');
        this.showTip(layer, '加载中…');

        newsDetail(id)
            .then((res) => {
                if (this.detailLayer !== layer || !layer.isValid) return;
                layer.removeAllChildren();
                if (res.code !== 0 || !res.data) {
                    this.showTip(layer, res.echo || '新闻不存在');
                    this.createRoundBtn(layer, 'BtnBack', '返回列表', 0, -((PANEL_H - 100) / 2) + 34, 140, 44,
                        () => this.loadList(this.page), 'ghost');
                    return;
                }
                this.renderDetail(layer, res.data.title, res.data.publish_time, res.data.content);
            })
            .catch(() => {
                if (this.detailLayer !== layer || !layer.isValid) return;
                layer.removeAllChildren();
                this.showTip(layer, '网络异常，请稍后重试');
                this.createRoundBtn(layer, 'BtnBack', '返回列表', 0, -((PANEL_H - 100) / 2) + 34, 140, 44,
                    () => this.loadList(this.page), 'ghost');
            });
    }

    /** 渲染详情：返回 + 标题 + 日期 + 可滚动正文 */
    private renderDetail(layer: Node, title: string, publishTime: string, content: string): void {
        const layerH = PANEL_H - 100;
        const top = layerH / 2;

        this.createRoundBtn(layer, 'BtnBack', '返回', -PANEL_W / 2 + 60, top - 30, 96, 42,
            () => this.loadList(this.page), 'ghost');
        this.createLabel(layer, 'Title', this.clip(title, 24), -PANEL_W / 2 + 130, top - 26, 26, TechText.bright, Label.HorizontalAlign.LEFT, PANEL_W - 250);
        this.createLabel(layer, 'Date', this.formatDate(publishTime), PANEL_W / 2 - 60, top - 28, 18, TechText.dim, Label.HorizontalAlign.RIGHT, 100);

        // 正文视口：Mask 裁剪超出部分（不加 Graphics，避免与 Mask 内部图形冲突）
        const viewW = PANEL_W - 100;
        const viewH = layerH - 120;
        const view = new Node('Viewport');
        view.layer = layer.layer;
        view.addComponent(UITransform).setContentSize(viewW, viewH);
        const maskComp = view.addComponent(Mask);
        maskComp.type = MaskType.GRAPHICS_RECT;
        view.setPosition(0, -60, 0);
        layer.addChild(view);

        // 正文：纯文本 Label（RESIZE_HEIGHT 自动换行撑高），由视口裁剪
        const text = this.htmlToText(content);
        const contentNode = new Node('Content');
        contentNode.layer = layer.layer;
        const cut = contentNode.addComponent(UITransform);
        cut.setAnchorPoint(0.5, 1);
        cut.setContentSize(viewW - 24, 10);
        const lab = contentNode.addComponent(Label);
        lab.fontSize = 20;
        lab.lineHeight = 30;
        lab.color = new Color(196, 214, 230, 255);
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        lab.verticalAlign = Label.VerticalAlign.TOP;
        lab.overflow = Label.Overflow.RESIZE_HEIGHT;
        lab.enableWrapText = true;
        contentNode.setPosition(0, viewH / 2, 0);
        view.addChild(contentNode);
        lab.string = text || '（正文为空）';

        // 滚动：鼠标滚轮 + 触摸拖拽，offset 限制在 [0, 正文超出高度]
        let offset = 0;
        const apply = (): void => {
            const over = Math.max(0, cut.height - viewH);
            offset = Math.max(0, Math.min(offset, over));
            contentNode.setPosition(0, viewH / 2 - offset, 0);
        };
        view.on(Node.EventType.MOUSE_WHEEL, (e: EventMouse) => {
            offset += e.getScrollY() * 0.5;
            apply();
        }, this);
        let dragY: number | null = null;
        view.on(Node.EventType.TOUCH_START, (e: any) => { dragY = e.getUILocation().y; }, this);
        view.on(Node.EventType.TOUCH_MOVE, (e: any) => {
            if (dragY === null) return;
            offset += dragY - e.getUILocation().y;
            dragY = e.getUILocation().y;
            apply();
        }, this);
        view.on(Node.EventType.TOUCH_END, () => { dragY = null; }, this);
        view.on(Node.EventType.TOUCH_CANCEL, () => { dragY = null; }, this);
    }

    // ==================== 通用工具 ====================

    /** 居中提示文案（加载中/空/失败），返回 label 节点便于外部销毁 */
    private showTip(parent: Node, text: string): Label {
        return this.createLabel(parent, 'Tip', text, 0, 0, 22, TechText.dim);
    }

    /** 圆角小按钮（关闭/返回/翻页复用） */
    private createRoundBtn(
        parent: Node, name: string, label: string,
        x: number, y: number, w: number, h: number,
        onClick: () => void, kind: 'primary' | 'ghost' | 'danger' = 'primary',
    ): Node {
        const btn = new Node(name);
        btn.layer = this.panel!.layer;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        paintTechButton(btn.addComponent(Graphics), w, h, kind);
        this.createLabel(btn, 'Label', label, 0, 0, 22, TechText.primary);
        btn.on(Node.EventType.TOUCH_END, onClick, this);
        pressEffect(btn);
        parent.addChild(btn);
        return btn;
    }

    /** 置灰按钮（翻页到头时禁用）：转暗色，点击仍被调用方的边界判断拦截 */
    private setBtnEnabled(btn: Node, enabled: boolean): void {
        const lab = btn.getChildByName('Label')?.getComponent(Label);
        if (lab) lab.color = enabled ? TechText.primary : new Color(70, 92, 112, 255);
    }

    /** 创建文本标签 */
    private createLabel(
        parent: Node, name: string, text: string,
        x: number, y: number, fontSize: number, color: Color,
        align: HorizontalTextAlignment = Label.HorizontalAlign.CENTER,
        width = 400,
    ): Label {
        const n = new Node(name);
        n.layer = parent.layer;
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(width, fontSize + 14);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.color = color;
        l.horizontalAlign = align;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        parent.addChild(n);
        return l;
    }

    /** 超长文本截断（补省略号） */
    private clip(text: string, max: number): string {
        const s = (text || '').trim();
        return s.length > max ? `${s.slice(0, max)}…` : s;
    }

    /** publish_time（ISO8601）转 yyyy-mm-dd */
    private formatDate(raw: string): string {
        if (!raw) return '';
        return raw.length >= 10 ? raw.slice(0, 10) : raw;
    }

    /** 富文本转纯文本：换行标签转 \n，剥掉其余标签，还原常用实体 */
    private htmlToText(html: string): string {
        let t = html || '';
        t = t.replace(/<br\s*\/?>/gi, '\n');
        t = t.replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
        t = t.replace(/<[^>]*>/g, '');
        t = t
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
        return t.replace(/\n{3,}/g, '\n\n').trim();
    }

    /** 关闭弹窗 */
    private close(): void {
        this.node.destroy();
    }
}
