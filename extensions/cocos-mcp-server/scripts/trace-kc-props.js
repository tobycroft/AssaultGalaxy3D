// Capture exact property names accessed on knowledge-client
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

// Proxy on knowledge-client that logs every prop access
const kcStub = {
    syncKnowledge: function () { return Promise.resolve({ success: true }); },
    getKnowledgeData: function () { return Promise.resolve({}); },
    uploadKnowledge: function (d) { return Promise.resolve({ success: true }); },
    checkKnowledgeVersion: function () { return Promise.resolve({ upToDate: true }); },
    setKnowledgeSessionProvider: function (f) { return true; },
};
const kcProxy = new Proxy(kcStub, {
    get: function (target, prop) {
        console.log('KC PROP ACCESS:', String(prop));
        const v = target[prop];
        if (v === undefined) {
            console.log('  >>> UNDEFINED! This is the bug: handler expects .' + String(prop));
            return undefined;
        }
        return v;
    }
});

// Proxy on tool-guides too
const tgProxy = new Proxy(tgMod.exports, {
    get: function (target, prop) {
        console.log('TG PROP ACCESS:', String(prop));
        const v = target[prop];
        if (v === undefined) {
            console.log('  >>> TG UNDEFINED prop: .' + String(prop));
        }
        return v;
    }
});

const mod = { exports: {} };
const sandbox = {
    require: function (req) {
        if (req.includes('knowledge-client')) return kcProxy;
        if (req.includes('param-validator')) return { validateArgs: function () { return null; } };
        if (req.includes('tool-guides')) return tgProxy;
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

console.log('\n=== execute tool_guide ===');
instance.execute({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_scene' }, {})
    .then(res => console.log('OK:', JSON.stringify(res).substring(0, 300)))
    .catch(e => console.log('ERROR:', e.message));
