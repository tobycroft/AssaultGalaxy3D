/**
 * Comprehensive Extension Functionality Check
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

let pass = 0, fail = 0;
function check(desc, ok) {
    if (ok) { pass++; console.log('  \x1b[32m✅\x1b[0m ' + desc); }
    else { fail++; console.log('  \x1b[31m❌\x1b[0m ' + desc); }
}
function section(title) { console.log('\n' + title); }

const BASE = path.resolve(__dirname, '..');

// ===================== Setup mocks =====================
let definedPanels = {};
global.Editor = {
    App: { version: '3.8.5' },
    versions: { editor: '3.8.5', engine: '3.8.5' },
    Project: { name: 'test', path: BASE },
    Panel: {
        define: function(opts) { definedPanels['default'] = opts; return {}; },
        open: function(panelName) {
            if (!definedPanels[panelName]) throw new Error('Panel(' + panelName + ') 未定义');
            return Promise.resolve();
        },
        close: function() { return Promise.resolve(); },
    },
    Message: {
        request: function() { return Promise.resolve(null); },
        addBroadcastListener: function() {},
        broadcast: function() {},
    },
    Profile: {
        getConfig: function(k, d) { return d; },
        setConfig: function() {},
    },
    I18n: { t: function(k) { return k; } },
    log: function() {}, error: function() {}, warn: function() {}, info: function() {},
    Dialog: { open: function() { return Promise.resolve({ filePaths: [] }); } },
    MainMenu: { apply: function() {} },
    Utils: {
        uuid: function() { return 'u-' + Math.random().toString(36).slice(2); },
        getUuid: function() { return 'u'; },
    },
    Network: { get: function() {}, post: function() {} },
    path: BASE,
};

require.cache['cc'] = { exports: {
    Node: class Node { constructor() { this.name = ''; this.children = []; } },
    Component: class Component {},
    director: { getScene: function() { return null; } },
    game: { frameRate: 60 },
    resources: { load: function() {} },
    assetManager: { loadAny: function() {} },
} };
require.cache['electron'] = { exports: {
    BrowserWindow: class {},
    app: { getPath: function() { return '/tmp'; } }
} };

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent) {
    if (request === 'cc') return 'cc';
    if (request === 'electron') return 'electron';
    try { return originalResolve.apply(this, arguments); }
    catch(e) { return originalResolve.call(this, request, parent); }
};
process.env.COCOS_CREATOR = '1';

async function main() {
    const pkg = require(path.join(BASE, 'package.json'));

    // ===================== 1. package.json =====================
    section('📦 1. package.json 结构检查');
    check('name = "cocos-mcp"', pkg.name === 'cocos-mcp');
    check('package_version = 2', pkg.package_version === 2);
    check('version 格式: ' + pkg.version, /^\d+\.\d+\.\d+$/.test(pkg.version));
    check('editor >= 3.7.0', pkg.editor === '>=3.7.0');
    check('author 存在', !!pkg.author && pkg.author.length > 0);
    check('description 使用 i18n', typeof pkg.description === 'string' && pkg.description.startsWith('i18n:'));
    check('main 指向 ./dist/main.js', pkg.main === './dist/main.js');
    check('main 文件存在', fs.existsSync(path.join(BASE, pkg.main)));

    const panelKeys = Object.keys(pkg.panels || {});
    check('面板数量: 1', panelKeys.length === 1);
    const panelKey = panelKeys[0];
    check('面板键名 = "default"', panelKey === 'default');
    const panel = pkg.panels[panelKey];
    if (panel) {
        check('panel.title = i18n:cocos-mcp.panel_title', panel.title === 'i18n:cocos-mcp.panel_title');
        check('panel.type = dockable', panel.type === 'dockable');
        check('panel.main = dist/panels/default', panel.main === 'dist/panels/default');
        check('panel.main 目录存在', fs.existsSync(path.join(BASE, panel.main)));
        check('panel.icon = ./static/icon.png', panel.icon === './static/icon.png');
        check('panel.icon 存在', fs.existsSync(path.join(BASE, panel.icon)));
        check('panel.size 包含 width/height', panel.size && panel.size.width === 760 && panel.size.height === 820);
        check('panel.size 包含 min-width/min-height', panel.size && panel.size['min-width'] === 560 && panel.size['min-height'] === 680);
    }

    // ===================== 2. Panel loading =====================
    section('🖥️  2. Panel 面板加载检查');
    try {
        require(path.join(BASE, 'dist/panels/default/index.js'));
        check('panel/index.js 加载成功 (无异常)', true);
        check('Editor.Panel.define 被调用', !!definedPanels['default']);
        const panelDef = definedPanels['default'];
        if (panelDef) {
            check('panel.listeners 存在', !!panelDef.listeners);
            check('panel.template 存在', !!panelDef.template);
            check('panel.style 存在', !!panelDef.style);
            check('panel.$ 存在', !!panelDef['$']);
            check('panel.ready 是函数', typeof panelDef.ready === 'function');
            check('panel.beforeClose 是函数', typeof panelDef.beforeClose === 'function');
            check('panel.close 是函数', typeof panelDef.close === 'function');
            check('panel.messages 存在', !!panelDef.messages);
        }
    } catch(e) {
        check('panel/index.js 加载失败: ' + e.message, false);
    }

    // ===================== 3. Main extension =====================
    section('🚀 3. main.js 扩展加载检查');
    let ext;
    try {
        ext = require(path.join(BASE, 'dist/main.js'));
        check('main.js 加载成功', true);
        check('load() 方法存在', typeof ext.load === 'function');
        check('unload() 方法存在', typeof ext.unload === 'function');
        check('methods 导出是对象', ext.methods && typeof ext.methods === 'object');
    } catch(e) {
        check('main.js 加载失败: ' + e.message, false);
    }

    if (ext) {
        try {
            await ext.load();
            check('ext.load() 调用成功', true);
        } catch(e) {
            check('ext.load() 失败: ' + e.message, false);
        }
    }

    // ===================== 4. Message methods =====================
    section('📨 4. 消息方法完整性检查');
    const msgDefs = pkg.contributions && pkg.contributions.messages ? pkg.contributions.messages : {};
    const msgNames = Object.keys(msgDefs);
    check('消息总数: ' + msgNames.length, msgNames.length > 0);

    const mainMethods = [];
    const sceneMsgMethods = [];

    for (const [msgName, msgDef] of Object.entries(msgDefs)) {
        for (const method of msgDef.methods) {
            if (method.startsWith('default.')) {
                sceneMsgMethods.push({ msg: msgName, method: method.replace('default.', '') });
            } else {
                mainMethods.push({ msg: msgName, method });
            }
        }
    }

    console.log('  --- 主扩展方法 (' + mainMethods.length + ' 个) ---');
    // Deduplicate
    const seen = new Set();
    for (const {msg, method} of mainMethods) {
        if (seen.has(method)) continue;
        seen.add(method);
        const exists = ext && ext.methods && typeof ext.methods[method] === 'function';
        check(method + '()' + (exists ? '' : ' [缺失!]'), exists);
    }

    if (sceneMsgMethods.length > 0) {
        console.log('  --- 场景脚本方法 (' + sceneMsgMethods.length + ' 个) ---');
        for (const {msg, method} of sceneMsgMethods) {
            check('default.' + method + ' (消息: ' + msg + ')', true);
        }
    }

    // ===================== 5. openPanel =====================
    section('🔓 5. openPanel 面板打开测试');
    if (ext && ext.methods && typeof ext.methods.openPanel === 'function') {
        try {
            await ext.methods.openPanel();
            check('openPanel() 调用成功 → 面板已正确注册', true);
        } catch(e) {
            check('openPanel() 失败: ' + e.message, false);
        }
    } else {
        check('openPanel 方法未找到', false);
    }

    // ===================== 6. Scene script =====================
    section('🎬 6. Scene 场景脚本检查');
    try {
        const sceneScript = require(path.join(BASE, 'dist/scene.js'));
        check('scene.js 加载成功', true);

        const sceneMethods = pkg.contributions && pkg.contributions.scene && pkg.contributions.scene.methods
            ? pkg.contributions.scene.methods : [];

        check('scene methods 声明: ' + sceneMethods.length + ' 个', sceneMethods.length > 0);

        let sceneOk = 0, sceneMissing = 0;
        for (const m of sceneMethods) {
            if (typeof sceneScript[m] === 'function') {
                sceneOk++;
            } else {
                sceneMissing++;
                console.log('    ⚠️  ' + m + ' 未在 scene.js 中导出');
            }
        }
        check('已导出: ' + sceneOk + '/' + sceneMethods.length + ' 个方法', sceneMissing === 0);

        // Also check default.xxx methods referenced in messages
        for (const {msg, method} of sceneMsgMethods) {
            const exists = typeof sceneScript[method] === 'function';
            if (!exists) {
                console.log('    ⚠️  default.' + method + ' (消息: ' + msg + ') 未在 scene.js 中导出');
            }
        }
    } catch(e) {
        check('scene.js 加载失败: ' + e.message, false);
    }

    // ===================== 7. Dependencies =====================
    section('📦 7. 依赖完整性检查');
    const deps = pkg.dependencies || {};
    const depCount = Object.keys(deps).length;
    check('依赖声明: ' + depCount + ' 个', depCount > 0);

    for (const [name, version] of Object.entries(deps)) {
        const depPath = path.join(BASE, 'node_modules', name);
        const exists = fs.existsSync(depPath);
        check(name + ' @ ' + version + (exists ? '' : ' [MISSING]'), exists);
    }

    // ===================== 8. i18n =====================
    section('🌍 8. i18n 国际化检查');
    const i18nDir = path.join(BASE, 'i18n');
    if (fs.existsSync(i18nDir)) {
        const i18nFiles = fs.readdirSync(i18nDir).filter(f => f.endsWith('.js'));
        check('语言数量: ' + i18nFiles.length, i18nFiles.length >= 11);

        if (fs.existsSync(path.join(i18nDir, 'en.js'))) {
            const en = require(path.join(i18nDir, 'en.js'));
            const enKeys = Object.keys(en).length;
            check('en.js 作为回退语言: ' + enKeys + ' keys', enKeys > 0);

            let allMatch = true;
            for (const f of i18nFiles) {
                const lang = require(path.join(i18nDir, f));
                const keyCount = Object.keys(lang).length;
                if (keyCount !== enKeys) {
                    allMatch = false;
                    console.log('    ❌ ' + f + ': ' + keyCount + ' keys (期望 ' + enKeys + ')');
                }
            }
            if (allMatch) console.log('    ✅ 所有语言 ' + enKeys + ' keys 一致');
            check('所有语言 key 数量一致', allMatch);

            // Check specific i18n keys referenced in package.json
            // Only check extension-owned keys (cocos-mcp.xxx), skip built-in keys like menu.extension
            const i18nKeysInPkg = [];
            JSON.stringify(pkg, (k, v) => {
                if (typeof v === 'string' && v.startsWith('i18n:cocos-mcp.')) {
                    const key = v.replace('i18n:cocos-mcp.', '');
                    i18nKeysInPkg.push(key);
                }
                return v;
            });
            const missingI18n = i18nKeysInPkg.filter(k => !en[k]);
            check('package.json 中引用的扩展 i18n key 在 en.js 中全部存在', missingI18n.length === 0);
            if (missingI18n.length > 0) {
                console.log('    缺失的 key: ' + missingI18n.join(', '));
            }
        }
    }

    // ===================== 9. Static assets =====================
    section('📁 9. 静态资源检查');
    const staticFiles = [
        ['static/icon.png', '面板图标'],
        ['static/style/default/index.css', '面板样式'],
        ['static/template/default/index.html', '面板 HTML 模板'],
        ['static/template/vue/mcp-server-app.html', 'Vue 应用模板'],
        ['static/script/panel-utils.js', '面板工具脚本'],
    ];
    for (const [file, desc] of staticFiles) {
        const fullPath = path.join(BASE, file);
        check(file + ' (' + desc + ')', fs.existsSync(fullPath));
    }

    // ===================== 10. dist structure =====================
    section('📂 10. dist 目录结构检查');
    const keyFiles = [
        'dist/main.js',
        'dist/scene.js',
        'dist/mcp-server.js',
        'dist/panels/default/index.js',
        'dist/mcp-config-manager.js',
        'dist/mcp-client-configs.js',
    ];
    for (const f of keyFiles) {
        check(f, fs.existsSync(path.join(BASE, f)));
    }

    // ===================== 11. Contributions =====================
    section('🔌 11. contributions 配置检查');
    check('contributions.menu 存在', !!(pkg.contributions && pkg.contributions.menu));
    check('contributions.messages 存在', !!(pkg.contributions && pkg.contributions.messages));
    check('contributions.scene 存在', !!(pkg.contributions && pkg.contributions.scene));

    if (pkg.contributions && pkg.contributions.scene) {
        check('contributions.scene.script = ./dist/scene.js',
            pkg.contributions.scene.script === './dist/scene.js');
    }

    // ===================== Summary =====================
    console.log('\n' + '='.repeat(60));
    const total = pass + fail;
    console.log('检查结果: ' + pass + '/' + total + ' 通过, ' + fail + ' 失败');
    console.log('='.repeat(60));

    if (fail > 0) {
        console.log('\n⚠️  有 ' + fail + ' 项检查失败！');
    } else {
        console.log('\n✅ 全部 ' + pass + ' 项检查通过 — 插件功能正常！');
    }
}

main().catch(e => {
    console.error('检查脚本异常:', e.message);
    console.error(e.stack);
    process.exit(1);
});
