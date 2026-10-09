// Precise trace: real tool-guides module + knowledge-client stub, invoke tool_guide
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// Real tool-guides module (load in same sandbox)
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
console.log('tool-guides loaded:', Object.keys(tgMod.exports));

// knowledge-client stub with real function names
const kcStub = {
    syncKnowledge: function () { return Promise.resolve({ success: true }); },
    getKnowledgeData: function () { return Promise.resolve({}); },
    uploadKnowledge: function (d) { return Promise.resolve({ success: true }); },
    checkKnowledgeVersion: function () { return Promise.resolve({ upToDate: true }); },
    setKnowledgeSessionProvider: function (f) { return true; },
};

const mod = { exports: {} };
const sandbox = {
    require: function (req) {
        console.log('REQUIRE:', req);
        if (req.includes('knowledge-client')) return kcStub;
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

try {
    vm.runInContext(kh, sandbox, { timeout: 5000 });
    const HandlerClass = mod.exports.KnowledgeHandler;
    const instance = new HandlerClass();

    console.log('\n=== tool_guide 调用 ===');
    try {
        const r = instance.getToolGuideResponse({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_scene' }, {});
        if (r && typeof r.then === 'function') {
            r.then(res => console.log('result:', JSON.stringify(res).substring(0, 400)))
             .catch(e => console.log('ASYNC ERROR:', e.message));
        } else {
            console.log('sync:', JSON.stringify(r).substring(0, 400));
        }
    } catch (e) {
        console.log('SYNC ERROR:', e.message);
        // Print stack with the sandbox file
        const lines = e.stack ? e.stack.split('\n') : [];
        lines.slice(0, 6).forEach(l => console.log('  ', l.trim()));
    }

    // Also try via execute()
    console.log('\n=== execute() 调用 (action=tool_guide, topic=tool_guide, query=cocos_scene) ===');
    try {
        const r = instance.execute({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_scene' }, {});
        if (r && typeof r.then === 'function') {
            r.then(res => console.log('execute result:', JSON.stringify(res).substring(0, 400)))
             .catch(e => console.log('execute ERROR:', e.message));
        } else {
            console.log('execute sync:', JSON.stringify(r).substring(0, 400));
        }
    } catch (e) {
        console.log('execute SYNC ERROR:', e.message);
    }
} catch (e) {
    console.log('Load error:', e.message.substring(0, 200));
}
