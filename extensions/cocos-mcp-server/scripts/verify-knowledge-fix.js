// Verify knowledge tool_guide fix with REAL modules
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// Real tool-guides module
const tgMod = { exports: {} };
const tgSandbox = {
    require: function (req) {
        const resolved = path.resolve('dist/tools/cocos/data/tool-guides', req);
        return require(resolved.endsWith('.js') ? resolved : resolved + '.js');
    },
    module: tgMod, exports: tgMod.exports,
    __dirname: path.resolve('dist/tools/cocos/data/tool-guides'),
    console: console, process: process,
};
tgSandbox.globalThis = tgSandbox;
tgSandbox.global = tgSandbox;
vm.createContext(tgSandbox);
vm.runInContext(fs.readFileSync('dist/tools/cocos/data/tool-guides/index.js', 'utf8'), tgSandbox, { timeout: 5000 });

// REAL knowledge-client (with our fix)
const kcReal = require('../dist/auth/knowledge-client.js');
console.log('knowledge-client exports:', Object.keys(kcReal));
console.log('fetchServerKnowledge:', typeof kcReal.fetchServerKnowledge);

// REAL param-validator? It needs Editor — stub it
const mod = { exports: {} };
const sandbox = {
    require: function (req) {
        if (req.includes('knowledge-client')) return kcReal;
        if (req.includes('param-validator')) return { validateArgs: function () { return null; } };
        if (req.includes('tool-guides')) return tgMod.exports;
        return {};
    },
    module: mod, exports: mod.exports,
    __dirname: path.resolve('dist/tools/cocos/handlers'),
    __filename: path.resolve('dist/tools/cocos/handlers/knowledge-handler.js'),
    console: console, process: process, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
};
sandbox.globalThis = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(kh, sandbox, { timeout: 5000 });
const instance = new mod.exports.KnowledgeHandler();

(async () => {
    console.log('\n=== 1. tool_guide with valid topic ===');
    try {
        const r = await instance.execute({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_scene' }, {});
        console.log('RESULT:', JSON.stringify(r).substring(0, 500));
    } catch (e) {
        console.log('ERROR:', e.message.substring(0, 150));
    }

    console.log('\n=== 2. tool_guide different query ===');
    try {
        const r = await instance.execute({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_node' }, {});
        console.log('RESULT:', JSON.stringify(r).substring(0, 300));
    } catch (e) {
        console.log('ERROR:', e.message.substring(0, 150));
    }

    console.log('\n=== 3. Regression: component_properties still works ===');
    try {
        const r = await instance.execute({ action: 'component_properties', topic: 'cc.Label' }, {});
        console.log('RESULT:', JSON.stringify(r).substring(0, 300));
    } catch (e) {
        console.log('ERROR:', e.message.substring(0, 150));
    }

    console.log('\n=== 4. Regression: best_practices still works ===');
    try {
        const r = await instance.execute({ action: 'best_practices', topic: 'best_practices' }, {});
        console.log('RESULT:', JSON.stringify(r).substring(0, 300));
    } catch (e) {
        console.log('ERROR:', e.message.substring(0, 150));
    }
})();
