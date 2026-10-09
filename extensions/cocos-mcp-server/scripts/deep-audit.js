/**
 * Deep Audit — checks for Cocos MCP extension (clean state, no task-list)
 */
const fs = require('fs');
const path = require('path');
const { compile } = require('@vue/compiler-dom');

const BASE = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(desc, cond) {
    if (cond) { pass++; console.log('  ✅ ' + desc); }
    else { fail++; console.log('  ❌ ' + desc); }
}
function section(t) { console.log('\n' + t); }

const pkg = require(path.join(BASE, 'package.json'));

// ============ 1. package.json ============
section('📦 1. package.json');
ok('name = "cocos-mcp" (消息通道名)', pkg.name === 'cocos-mcp');
ok('version = ' + pkg.version, /^\d+\.\d+\.\d+$/.test(pkg.version));
ok('editor >= 3.7.0', pkg.editor === '>=3.7.0');
ok('package_version = 2', pkg.package_version === 2);
ok('main 存在', fs.existsSync(path.join(BASE, pkg.main)));

const panelKeys = Object.keys(pkg.panels || {});
ok('面板数量 = 1 (default)', panelKeys.length === 1 && panelKeys[0] === 'default');
const panel = pkg.panels['default'];
ok('panel.title = i18n:cocos-mcp.panel_title', panel.title === 'i18n:cocos-mcp.panel_title');
ok('panel.main 目录存在', fs.existsSync(path.join(BASE, panel.main)));
ok('panel.icon 存在', fs.existsSync(path.join(BASE, panel.icon)));

ok('menu 数量 = 1 (open-panel)', pkg.contributions.menu.length === 1 && pkg.contributions.menu[0].message === 'open-panel');

const msgs = pkg.contributions.messages;
ok('messages 数量 = 39', Object.keys(msgs).length === 39);
ok('无 open-task-list 消息', !msgs['open-task-list']);
ok('无 get/clear-request-history 消息', !msgs['get-request-history'] && !msgs['clear-request-history']);

const scene = pkg.contributions.scene;
ok('scene.script 存在', !!(scene && fs.existsSync(path.join(BASE, scene.script))));
ok('scene methods: ' + (scene ? scene.methods.length : 0) + ' 个', scene && scene.methods.length === 12);

// ============ 2. 消息通道一致性 ============
section('📨 2. 消息通道一致性');
const panelJs = fs.readFileSync(path.join(BASE, 'dist/panels/default/index.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(BASE, 'dist/main.js'), 'utf8');
ok("面板 'cocos-mcp-server' 残留: 0", (panelJs.match(/'cocos-mcp-server'/g) || []).length === 0);
ok("面板 'cocos-mcp' 通道调用 (期望 33-35)", (panelJs.match(/'cocos-mcp'/g) || []).length >= 30);
ok("main.js 'cocos-mcp-server' 残留: 0", (mainJs.match(/'cocos-mcp-server'/g) || []).length === 0);
ok("main.js open('cocos-mcp.default')", mainJs.includes("('cocos-mcp.default');"));

// ============ 3. main.js 完整性 ============
section('🚀 3. main.js 完整性');
ok('以 use strict 开头', mainJs.startsWith("'use strict';"));
ok('无 request-monitor-hook 引用', (mainJs.match(/request-monitor-hook/g) || []).length === 0);
ok('无 openRequestMonitor/openTaskList 残留', !mainJs.includes('openRequestMonitor') && !mainJs.includes('openTaskList'));
ok('无 getRequestHistory/clearRequestHistory 残留', !mainJs.includes('getRequestHistory') && !mainJs.includes('clearRequestHistory'));

// ============ 4. Vue 模板 ============
section('🖥️  4. Vue 模板');
const vue = fs.readFileSync(path.join(BASE, 'static/template/vue/mcp-server-app.html'), 'utf8');
try {
    compile(vue, { mode: 'function' });
    ok('Vue 模板编译通过', true);
} catch (e) {
    ok('Vue 模板编译失败: ' + e.message.substring(0, 100), false);
}
const openDivs = (vue.match(/<div/g) || []).length;
const closeDivs = (vue.match(/<\/div>/g) || []).length;
ok('div 平衡: ' + openDivs + '/' + closeDivs, openDivs === closeDivs);
ok('3 个 Tab 按钮 (server/tools/config)', (vue.match(/tab-button/g) || []).length === 3);
ok('3 个 tab-content', (vue.match(/tab-content/g) || []).length === 3);
ok('无 requests Tab', !vue.includes("switchTab('requests')"));
ok('无 rm-section/rmList/rmCount', !vue.includes('rm-section') && !vue.includes('rmList') && !vue.includes('rmCount'));

// ============ 5. Panel 注入清理 ============
section('🧹 5. Panel 注入清理');
ok('无 TaskList 注入', !panelJs.includes('TaskList'));
ok('无 byIdShadow', !panelJs.includes('byIdShadow'));
ok('无 rmList', !panelJs.includes('rmList'));
ok('以 use strict + 混淆 IIFE 开头', panelJs.startsWith("'use strict';\n(function(_0x52edbc"));

// ============ 6. CSS ============
section('🎨 6. CSS');
const css = fs.readFileSync(path.join(BASE, 'static/style/default/index.css'), 'utf8');
ok('CSS 大小恢复原始 (23479 字节)', css.length === 23479);
ok('无 rm-* 样式残留', (css.match(/\.rm-/g) || []).length === 0);
ok('无 btn-danger', !css.includes('btn-danger'));
const vars = ['--blue', '--green', '--red', '--orange', '--text', '--text2', '--text3', '--card', '--border', '--bg', '--mono', '--radius', '--shadow'];
let varsMissing = vars.filter(v => !css.includes(v + ':'));
ok('CSS 变量完整 (缺: ' + (varsMissing.join(',') || '无') + ')', varsMissing.length === 0);

// ============ 7. i18n ============
section('🌍 7. i18n');
const i18nDir = path.join(BASE, 'i18n');
const langs = fs.readdirSync(i18nDir).filter(f => f.endsWith('.js'));
let i18nKeys = null, i18nOk = true, keyErrors = [];
for (const lf of langs) {
    try {
        const lang = require(path.join(i18nDir, lf));
        if (!i18nKeys) i18nKeys = Object.keys(lang).length;
        if (Object.keys(lang).length !== i18nKeys) { i18nOk = false; keyErrors.push(lf + '=' + Object.keys(lang).length); }
    } catch (e) {
        i18nOk = false;
        keyErrors.push(lf + ' 解析失败');
    }
}
ok(langs.length + ' 语言 key 数一致: ' + i18nKeys + ' (问题: ' + (keyErrors.join(', ') || '无') + ')', i18nOk);
const en = require(path.join(i18nDir, 'en.js'));
const needI18n = ['panel_title', 'open_panel', 'extension_name', 'description'];
let i18nMissing = needI18n.filter(k => !en[k]);
ok('核心 i18n key 存在 (缺: ' + (i18nMissing.join(',') || '无') + ')', i18nMissing.length === 0);
const pkgI18n = [];
JSON.stringify(pkg, (k, v) => { if (typeof v === 'string' && v.startsWith('i18n:cocos-mcp.')) pkgI18n.push(v.replace('i18n:cocos-mcp.', '')); return v; });
const pkgI18nMissing = pkgI18n.filter(k => !en[k]);
ok('package.json 引用的 i18n key 全存在 (缺: ' + (pkgI18nMissing.join(',') || '无') + ')', pkgI18nMissing.length === 0);

// ============ 8. 静态资源 ============
section('📁 8. 静态资源');
const staticFiles = ['static/icon.png', 'static/style/default/index.css', 'static/template/default/index.html', 'static/template/vue/mcp-server-app.html', 'static/script/panel-utils.js'];
let sfMissing = staticFiles.filter(f => !fs.existsSync(path.join(BASE, f)));
ok('静态资源完整 (缺: ' + (sfMissing.join(',') || '无') + ')', sfMissing.length === 0);
ok('模板 packages://cocos-mcp 路径存在', vue.includes('packages://cocos-mcp/static/icon.png'));

// ============ 9. 依赖 ============
section('📦 9. 依赖');
let depsOk = true, depErrors = [];
for (const [name] of Object.entries(pkg.dependencies || {})) {
    if (!fs.existsSync(path.join(BASE, 'node_modules', name))) { depsOk = false; depErrors.push(name); }
}
ok('全部依赖已安装 (缺: ' + (depErrors.join(',') || '无') + ')', depsOk);

// ============ 10. 安全审计 ============
section('🔍 10. 安全审计');
const scanFiles = ['dist/main.js', 'dist/panels/default/index.js', 'package.json'];
let absPaths = [];
for (const f of scanFiles) {
    const c = fs.readFileSync(path.join(BASE, f), 'utf8');
    const absWin = c.match(/[A-Z]:\\[^\s"',;]*/g) || [];
    for (const p of absWin) {
        if (!p.includes('\\node_modules\\')) absPaths.push(f + ': ' + p);
    }
}
ok('无硬编码绝对路径' + (absPaths.length ? ' — 发现: ' + absPaths.join('; ') : ''), absPaths.length === 0);

// ============ Summary ============
console.log('\n' + '='.repeat(60));
console.log('深度排查结果: ' + pass + '/' + (pass + fail) + ' 通过');
if (fail > 0) {
    console.log('⚠️  ' + fail + ' 项失败!');
    process.exit(1);
} else {
    console.log('✅ 全部通过 — 插件干净完整!');
}
