/**
 * End-to-end test: load main.js → start real MCP server → send HTTP request → verify hook captured
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

// Clean debug log
try { fs.unlinkSync(path.join(__dirname, '..', 'dist', 'request-monitor-debug.log')); } catch (e) {}

// Mock Editor with Project.path (the missing piece from before)
global.Editor = {
    App: { version: '3.8.8' },
    versions: { editor: '3.8.8', engine: '3.8.8' },
    Project: { name: 'test-proj', path: path.resolve(__dirname, '..') },
    Panel: { define: function (o) { return {}; }, open: function () { return Promise.resolve(); }, close: function () { return Promise.resolve(); } },
    Message: {
        request: function () { return Promise.resolve(null); },
        addBroadcastListener: function () {}, broadcast: function () {},
    },
    Profile: { getConfig: function (k, d) { return d; }, setConfig: function () {} },
    I18n: { t: function (k) { return k; } },
    log: function () {}, error: function () {}, warn: function () {}, info: function () {},
    Dialog: { open: function () { return Promise.resolve({ filePaths: [] }); } },
    MainMenu: { apply: function () {} },
    Utils: { uuid: function () { return 'u-' + Math.random().toString(36).slice(2); }, getUuid: function () { return 'u'; } },
    Network: { get: function () {}, post: function () {} },
    path: path.resolve(__dirname, '..'),
    settings: { querySettings: function () { return {}; } },
    Process: { run: function () { return Promise.resolve(); } },
};
require.cache['cc'] = { exports: {
    Node: class Node { constructor() { this.name = ''; this.children = []; } },
    Component: class Component {},
    director: { getScene: function () { return null; } },
    game: { frameRate: 60 },
    resources: { load: function () {} },
    assetManager: { loadAny: function () {} },
} };
require.cache['electron'] = { exports: { BrowserWindow: class {}, app: { getPath: function () { return '/tmp'; } } } };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, p) {
    if (r === 'cc' || r === 'electron') return r;
    try { return origResolve.apply(this, arguments); }
    catch (e) { return origResolve.call(this, r, p); }
};
process.env.COCOS_CREATOR = '1';

(async () => {
    console.log('=== 1. Load main.js (hook patches http.Server) ===');
    const ext = require(path.resolve(__dirname, '..', 'dist', 'main.js'));
    await ext.load();
    console.log('load() done');
    console.log('getRequestHistory:', typeof ext.methods.getRequestHistory);

    console.log('');
    console.log('=== 2. Start MCP server ===');
    try {
        await ext.methods.startServer();
        console.log('startServer() OK');
    } catch (e) {
        console.log('startServer error:', e.message);
    }
    await new Promise(r => setTimeout(r, 1000));

    console.log('');
    console.log('=== 3. Send MCP tools/call via HTTP ===');
    const http = require('http');
    const payload = JSON.stringify({
        jsonrpc: '2.0', method: 'tools/call',
        params: { name: 'cocos_node', arguments: { action: 'create_node', name: 'et' } },
        id: 1
    });
    const result = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: 3000, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve({ status: res.statusCode, body: d.substring(0, 200) }));
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.write(payload);
        req.end();
    });
    console.log('HTTP result:', JSON.stringify(result));
    await new Promise(r => setTimeout(r, 500));

    console.log('');
    console.log('=== 4. Check hook entries via main.js method ===');
    const hist = ext.methods.getRequestHistory(10);
    console.log('getRequestHistory →', hist.length, 'entries');
    if (hist.length > 0) {
        console.log('First entry:', JSON.stringify(hist[0], null, 2));
    }

    console.log('');
    console.log('=== 5. Debug log ===');
    try {
        console.log(fs.readFileSync(path.join(__dirname, '..', 'dist', 'request-monitor-debug.log'), 'utf8'));
    } catch (e) {
        console.log('(debug log not found — hook never loaded?)');
    }

    try { await ext.methods.stopServer(); } catch (e) {}
    process.exit(0);
})();
