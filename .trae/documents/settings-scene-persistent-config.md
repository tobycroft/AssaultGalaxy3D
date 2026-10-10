# 设置界面（独立场景）+ 配置持久化 实施计划

## Context

点击首页"设置"按钮目前无响应（BtnSettings 未绑定事件）。需求：进入独立设置场景，可配置**音量、帧率、画质档位**，且所有配置持久化（刷新/重启后保留）。用户已确认采用**独立场景**方案（与 Debug 场景同模式）。

现有可复用基础：
- [MusicManager.ts](file:///Users/tobycroft/COCOS/AssaultGalaxy3D/assets/Common/MusicManager.ts)：常驻节点 + AudioSource（playOnAwake=false）+ localStorage key `bgm_enabled`，已有 toggle/isOn/init/syncFromConfig
- [UIAnim.ts](file:///Users/tobycroft/COCOS/AssaultGalaxy3D/assets/Common/UIAnim.ts)：fadeIn/popIn/pressEffect/fadeOutThen
- [Home.ts](file:///Users/tobycroft/COCOS/AssaultGalaxy3D/assets/Home/Home.ts) `switchScene(name)`：淡出后 loadScene
- [Debug.ts](file:///Users/tobycroft/COCOS/AssaultGalaxy3D/assets/Debug/Debug.ts) `createButton/createCategoryLabel/drawButtonBg`：代码创建 UI 的样式范式（Graphics 圆角 45,74,122、白字、Label 居中）
- 引擎 API（已核实）：`game.frameRate`（game.ts:416）运行时可写；`director.root.pipeline` 的 `shadingScale`（render-pipeline.ts:397）运行时可写；`AudioSource.volume` 可写

## 实施步骤

### 1. 新增 `assets/Common/SettingsStore.ts` — 统一持久化

- localStorage 单 key JSON（`settings_v1`）：`{ bgmEnabled: boolean, bgmVolume: number(0~1), frameRate: 30|60, shadingScale: 0.6|0.8|1.0 }`
- 静态方法：`get<K>(key, default)` / `set(key, value)`（读-改-写整包）
- 静态 `applyGraphics()`：应用 frameRate（`game.frameRate`）+ shadingScale（`director.root.pipeline`，类型不含则 `as any`，并判空）。web 端窗口 resize 会重置 shadingScale（screen.ts:52 用 resolutionScale 覆盖）——本期不做 resize 监听，接受该限制
- 默认值：bgmVolume=0.6、frameRate=60、shadingScale=1.0

### 2. 修改 `assets/Common/MusicManager.ts`

- `onLoad()`：音量改为从 `SettingsStore.get('bgmVolume', 0.6)` 读取并 `audioSource.volume = v`；开关读取优先走 SettingsStore（首次无 `settings_v1` 时回退读旧 key `bgm_enabled` 迁移，之后统一写 `settings_v1`）
- 新增 `setVolume(v)`：设置 `audioSource.volume` 并写 SettingsStore（供设置场景调用）

### 3. 新增 `assets/Home/Settings.ts` + `Settings.ts.meta` — 设置场景控制器

节点结构（全部代码创建，参照 Debug.ts bindSceneUI/createButton 风格）：
- `onLoad()`：标题"设置"、返回按钮（→ `fadeOutThen` 后 `director.loadScene('Home')`）、三组配置行：
  - **音量**：5 个档位按钮 0% / 25% / 50% / 75% / 100%，当前档高亮（白字/灰字区分），点击 → `MusicManager.setVolume()` + SettingsStore 写入
  - **帧率**：30 FPS / 60 FPS 两个按钮，点击 → `game.frameRate` + 持久化
  - **画质**：流畅(0.6) / 均衡(0.8) / 高清(1.0) 三个按钮，点击 → `shadingScale` + 持久化
- `start()`：`SettingsStore.applyGraphics()` 使画质/帧率配置在进入场景时即生效
- 复用 UIAnim：标题/按钮错峰 fadeIn、pressEffect

### 4. 新增 `assets/Settings.scene` + `Settings.scene.meta`

- 参照 [Debug.scene](file:///Users/tobycroft/COCOS/AssaultGalaxy3D/assets/Debug/Debug.scene) 手写最小 JSON：SceneAsset → Scene（Camera + Canvas 节点，Canvas 挂 UITransform/cc.Canvas/cc.Widget + Settings 控制器组件）
- **脚本组件引用**：Settings.ts.meta 手写固定 uuid（Cocos meta 即 JSON，可预设），场景内 `__type__` 用其**压缩 UUID**（引擎 `compressUuid` 算法；实现时先从 Home.ts.meta uuid ↔ Home.scene 中 `d2a29rUjelOgLXzrsziT68N` 的对应关系验证压缩算法，确保算对）
- 画布 1280x720、UI 层 33554432、clearFlags/背景色与 Debug 一致（无 3D 需求，保持纯 2D）
- 两个 meta 文件（Settings.ts.meta、Settings.scene.meta）uuid 自定且不与现有冲突

### 5. 修改 `assets/Home/Home.ts`

- 新增 `onSettingsClick()`：`this.switchScene('Settings')`
- `start()` 里代码绑定（与 BtnMusic 一致，不用改场景 JSON）：`canvas.getChildByName('MenuPanel')?.getChildByName('BtnSettings')` 判空后 `btn.on(Node.EventType.TOUCH_END, ...)` + `pressEffect(btn)`
- `start()` 里调用 `SettingsStore.applyGraphics()`：启动即应用已保存的画质/帧率

## 验证

1. `tsc --noEmit`（用项目 tsconfig，含 cc 声明）确认零错误
2. Creator 聚焦导入 Settings.ts/scene + meta（uuid 不冲突则直接采用）
3. 浏览器预览：首页点"设置"→ 进入设置场景（淡出过渡）；调音量 → 音乐音量即时变化；切帧率/画质档位 → 即时生效
4. 返回首页 → 再进设置，各档位保持上次选择；**刷新浏览器**后配置仍在（localStorage）
5. 回归：背景音乐开关跨场景行为不变（开→进 Debug 仍播放；关→不播放）

## 注意点

- 压缩 UUID 必须先验证算法再写场景 JSON，否则脚本组件挂不上（表现：场景打开无控制器）
- shadingScale 类型若不在 `PipelineRuntime` 声明里，用 `as any` 并注释引擎源码位置
- 不做 resize 监听（web 端改窗口大小后画质档可能回 1.0，本期接受）
