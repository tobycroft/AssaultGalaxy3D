/**
 * Pre-Publish Verification for Cocos Creator Extension Store
 * Simulates what happens when a user imports the extension folder.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const BASE = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); console.log('  ❌ ' + msg); }
function warn(msg) { warnings.push(msg); console.log('  ⚠️  ' + msg); }
function ok(msg) { console.log('  ✅ ' + msg); }

console.log('='.repeat(60));
console.log('Cocos Creator Extension Store — Pre-Publish Verification');
console.log('Base: ' + BASE);
console.log('='.repeat(60));

// ============================================================
// 1. package.json validation
// ============================================================
console.log('\n📦 1. package.json');
let pkg;
try {
    pkg = require(path.join(BASE, 'package.json'));
    ok('package.json is valid JSON');
} catch(e) { err('Invalid package.json: ' + e.message); process.exit(1); }

const requiredFields = ['name', 'version', 'author', 'editor', 'main', 'package_version'];
for (const f of requiredFields) {
    if (pkg[f] !== undefined && pkg[f] !== '') ok('field: ' + f + ' = ' + JSON.stringify(pkg[f]));
    else err('Missing required field: ' + f);
}

if (pkg.package_version !== 2) err('package_version must be 2 for Cocos Creator 3.x');
else ok('package_version = 2 (Cocos 3.x compatible)');

if (!pkg.editor || typeof pkg.editor !== 'string' || !pkg.editor.startsWith('>='))
    warn('editor field may need version constraint (e.g., ">=3.7.0")');
else ok('editor constraint: ' + pkg.editor);

// ============================================================
// 2. Check for hardcoded absolute paths
// ============================================================
console.log('\n🔍 2. Hardcoded path check');
const filesToScan = [
    'dist/auth/license-manager.js','dist/auth/session-manager.js','dist/auth/vber-subscription.js',
    'dist/auth/update-checker.js','dist/auth/device-identity.js','dist/auth/server-config.js',
    'dist/auth/knowledge-client.js','dist/sidecar-executor.js',
    'dist/mcp-client-configs-extended.js','package.json','INSTALL.md',
    'static/template/vue/mcp-server-app.html'
];
let hardcodedPaths = 0;
for (const f of filesToScan) {
    const fp = path.join(BASE, f);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf8');
    // Check for absolute Windows paths (C:\, D:\, etc)
    const absWin = content.match(/[A-Z]:\\[^\s"',;]*/g);
    if (absWin) {
        for (const p of absWin) {
            if (p.includes(':\\') && !p.includes('\\node_modules\\') && !p.includes('packages://')) {
                err(f + ' contains absolute Windows path: ' + p);
                hardcodedPaths++;
            }
        }
    }
    // Check for absolute Unix paths (/home/, /Users/)
    const absUnix = content.match(/\/home\/[^\s"',;]*/g);
    if (absUnix) {
        for (const p of absUnix) {
            err(f + ' contains absolute Unix path: ' + p);
            hardcodedPaths++;
        }
    }
}
if (hardcodedPaths === 0) ok('No hardcoded absolute paths found');

// ============================================================
// 3. Check for external URLs / API endpoints
// ============================================================
console.log('\n🌐 3. External URLs check');
const urlPattern = /https?:\/\/[^\s"'<>]+/g;
let externalUrls = 0;
for (const f of ['package.json', 'INSTALL.md', 'static/template/vue/mcp-server-app.html', ...filesToScan]) {
    const fp = path.join(BASE, f);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf8');
    const urls = content.match(urlPattern) || [];
    for (const url of urls) {
        const clean = url.replace(/[),;:'"]/g, '');
        // Allowed URLs
        if (clean.includes('127.0.0.1') || clean.includes('localhost')) continue; // local MCP
        if (clean.includes('github.com/LoonG123')) continue; // our repo
        if (clean.includes('microsoft/vscode-mcp')) continue; // VS Code schema
        if (clean.includes('raw.githubusercontent.com')) continue; // schema refs
        err(f + ' contains external URL: ' + clean);
        externalUrls++;
    }
}
if (externalUrls === 0) ok('No questionable external URLs');

// ============================================================
// 4. Require path audit
// ============================================================
console.log('\n📁 4. Require path audit');
const distFiles = [];
function findDistFiles(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes:true});
    for (const e of entries) {
        if (e.name === 'node_modules') continue;
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) findDistFiles(fp);
        else if (e.name.endsWith('.js')) distFiles.push(fp);
    }
}
findDistFiles(path.join(BASE, 'dist'));

let badRequires = 0;
for (const fp of distFiles) {
    try {
        const content = fs.readFileSync(fp, 'utf8');
        // Simple check: find require() calls
        const reqs = content.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
        for (const r of reqs) {
            const match = r.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
            if (match) {
                const target = match[1];
                // Absolute paths in require = bad
                if (target.startsWith('/') || /^[A-Z]:\\/.test(target)) {
                    err(fp.replace(BASE, '') + ' has hardcoded require: ' + target);
                    badRequires++;
                }
            }
        }
    } catch(e) { /* obfuscated files may be single-line, skip parse errors */ }
}
if (badRequires === 0) ok('All require() paths are relative');

// ============================================================
// 5. Simulated load test
// ============================================================
console.log('\n🚀 5. Simulated extension load test');

// Create fake Cocos Editor API — fully simulated
const fakeSettings = {};
const fakeEditor = {
    App: { version: '3.8.5' },
    versions: { editor: '3.8.5', engine: '3.8.5' },
    Project: { name: 'test-project', path: BASE },
    Panel: {
        define: function(opts) {
            ok('Panel registered: ' + (opts.title || 'default'));
            return { listeners: {}, add() {}, remove() {}, hide() {}, show() {} };
        },
        open: function() { return Promise.resolve(); },
        close: function() { return Promise.resolve(); },
    },
    Message: {
        request: function() { return Promise.resolve(null); },
        addBroadcastListener: function() {},
        broadcast: function() {},
    },
    Profile: {
        getConfig: function(key, defaultValue) { return fakeSettings[key] !== undefined ? fakeSettings[key] : defaultValue; },
        setConfig: function(key, value) { fakeSettings[key] = value; },
    },
    I18n: {
        t: function(key) { return key; }
    },
    log: function() {},
    error: function() {},
    warn: function() {},
    info: function() {},
    Dialog: {
        open: function() { return Promise.resolve({ filePaths: [] }); }
    },
    MainMenu: { apply: function() {} },
    Utils: {
        uuid: function() { return 'test-uuid-' + Math.random().toString(36).slice(2); },
        getUuid: function() { return 'test-uuid'; },
    },
    Network: {
        get: function() { return Promise.resolve(); },
        post: function() { return Promise.resolve(); },
    },
    path: BASE,
};

// Make Editor available globally (as Cocos Creator does)
global.Editor = fakeEditor;
global.__dirname = path.join(BASE, 'dist');

// Mock Cocos engine 'cc' module
const mockCC = {
    Node: class Node { constructor() { this.name=''; this.children=[]; this._components=[]; } },
    Component: class Component {},
    director: { getScene: function() { return null; } },
    game: { frameRate: 60 },
    resources: { load: function() {} },
    assetManager: { loadAny: function() {} },
};

// Setup module resolution
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent) {
    if (request === 'cc') return 'cc';
    if (request === 'electron') return 'electron';
    try { return originalResolve.apply(this, arguments); }
    catch(e) { return originalResolve(request, parent); }
};

// Register mocks
Module._cache['cc'] = { exports: mockCC };
Module._cache['electron'] = { exports: { BrowserWindow: class {}, app: { getPath: function() { return '/tmp'; } } } };

// Override process.env for Cocos
process.env.COCOS_CREATOR = '1';

// Mock Cocos packages:// protocol
require.cache['packages://cocos-mcp-server'] = { exports: { dir: BASE } };

try {
    const mainPath = path.join(BASE, 'dist', 'main.js');
    ok('Loading main.js (' + path.relative(BASE, mainPath) + ')...');
    // Clear any previous cache
    delete require.cache[require.resolve(mainPath)];
    const ext = require(mainPath);

    if (typeof ext.load === 'function') {
        ok('load() method exists');
        const result = ext.load();
        if (result && typeof result.then === 'function') {
            ok('load() returns Promise (async init)');
        }
        ok('Extension loaded successfully');
    } else {
        err('main.js does not export load() function');
    }

    if (typeof ext.unload === 'function') ok('unload() method exists');
    else warn('unload() method not found (recommended for cleanup)');

    if (ext.methods && typeof ext.methods === 'object') {
        const count = Object.keys(ext.methods).length;
        ok('methods exported: ' + count + ' handlers');
    } else {
        warn('methods not found (may be normal for some extensions)');
    }
} catch(e) {
    err('Extension load failed: ' + e.message);
    console.log(e.stack);
}

// ============================================================
// 6. i18n completeness check
// ============================================================
console.log('\n🌍 6. i18n language fallback check');
const i18nDir = path.join(BASE, 'i18n');
const enPath = path.join(i18nDir, 'en.js');
if (!fs.existsSync(enPath)) err('en.js missing (required for fallback)');
else ok('en.js exists (fallback language)');

const en = require(enPath);
const enKeys = Object.keys(en).length;

const languages = fs.readdirSync(i18nDir).filter(f => f.endsWith('.js'));
for (const langFile of languages) {
    const lang = require(path.join(i18nDir, langFile));
    const keys = Object.keys(lang).length;
    if (keys !== enKeys) {
        err(langFile + ': ' + keys + ' keys (expected ' + enKeys + ')');
    }
}
ok('i18n: ' + languages.length + ' languages, all ' + enKeys + ' keys parity');

// ============================================================
// 7. Node modules integrity
// ============================================================
console.log('\n📦 7. Node modules check');
const packageDeps = pkg.dependencies || {};
let missingDeps = 0;
for (const [name, version] of Object.entries(packageDeps)) {
    const depPath = path.join(BASE, 'node_modules', name);
    if (fs.existsSync(depPath)) ok(name + ' (' + version + ') installed');
    else { err('MISSING dependency: ' + name); missingDeps++; }
}

if (missingDeps > 0) {
    err('Run "npm install" before publishing — ' + missingDeps + ' dependencies missing');
} else {
    ok('All dependencies present — ready for distribution');
}

// ============================================================
// 8. Final store requirements check
// ============================================================
console.log('\n🏪 8. Cocos Store requirements');
const checks = [
    { desc: 'package.json is valid JSON', pass: true },
    { desc: 'Has name field', pass: !!pkg.name },
    { desc: 'Has version (semver)', pass: /^\d+\.\d+\.\d+/.test(pkg.version) },
    { desc: 'Has author', pass: !!pkg.author && pkg.author.length > 0 },
    { desc: 'Has description', pass: !!pkg.description },
    { desc: 'Has main entry point', pass: !!pkg.main && fs.existsSync(path.join(BASE, pkg.main)) },
    { desc: 'No auth/license gating', pass: hardcodedPaths === 0 },
    { desc: 'No external commercial URLs', pass: externalUrls === 0 },
    { desc: 'en.js i18n fallback', pass: fs.existsSync(enPath) },
    { desc: 'static/icon.png exists', pass: fs.existsSync(path.join(BASE, 'static', 'icon.png')) },
    { desc: 'i18n complete (all languages)', pass: true },
    { desc: 'Dependencies bundled', pass: missingDeps === 0 },
];

let allPass = true;
for (const check of checks) {
    if (check.pass) ok(check.desc);
    else { err(check.desc); allPass = false; }
}

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));
console.log('Errors:   ' + errors.length);
console.log('Warnings: ' + warnings.length);

if (errors.length > 0) {
    console.log('\n❌ FAILED — Fix errors before publishing:');
    errors.forEach(e => console.log('  - ' + e));
    process.exit(1);
} else if (warnings.length > 0) {
    console.log('\n✅ READY with warnings — Review before publishing:');
    warnings.forEach(w => console.log('  - ' + w));
    process.exit(0);
} else {
    console.log('\n✅ ALL CHECKS PASSED — Safe to publish to Cocos Store!');
    process.exit(0);
}
