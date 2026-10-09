import { _decorator, Component, director } from 'cc';

const { ccclass } = _decorator;

/**
 * 首页控制器。
 * 负责首页上的 “Debug” 调试按钮入口：点击后进入 Debug 场景。
 */
@ccclass('Home')
export class Home extends Component {
    /** 点击 Debug 按钮：进入调试场景 */
    public onDebugClick(): void {
        director.loadScene('Debug');
    }
}
