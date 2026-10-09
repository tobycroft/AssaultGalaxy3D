// Trace getToolGuideResponse internals with a full Proxy on every require
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// Track all requires and property accesses
const propLog = [];
function makeModuleProxy(name) {
    return new Proxy({}, {
        get: function (target, prop) {
            if (typeof prop === 'string' && !['then', 'inspect', 'valueOf', 'toString', 'length', 'name', 'caller', 'arguments', 'prototype', 'constructor', Symbol.toPrimitive, Symbol.toStringTag, Symbol.iterator, Symbol.hasInstance].includes(prop)) {
                propLog.push(name + '.' + prop);
                console.log('ACCESS [' + name + '].' + prop);
            }
            return function () { return Promise.resolve({}); };
        }
    });
}

const reqLog = [];
const mod = { exports: {} };
const sandbox = {
    require: function (req) {
        reqLog.push(req);
        console.log('REQUIRE:', req);
        return makeModuleProxy('MOD:' + req.split('/').pop());
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

(async () => {
    vm.runInContext(kh, sandbox, { timeout: 5000 });
    const HandlerClass = mod.exports.KnowledgeHandler;
    const instance = new HandlerClass();

    // Call with the CORRECT params per tool definition: topic='tool_guide', query='cocos_scene'
    console.log('\n=== getToolGuideResponse({action:"tool_guide", topic:"tool_guide", query:"cocos_scene"}) ===');
    try {
        const r = instance.getToolGuideResponse({ action: 'tool_guide', topic: 'tool_guide', query: 'cocos_scene' }, {});
        if (r && typeof r.then === 'function') {
            await r.then(res => console.log('result:', JSON.stringify(res).substring(0, 300)));
        } else {
            console.log('sync result:', JSON.stringify(r).substring(0, 300));
        }
    } catch (e) {
        console.log('THREW:', e.message);
    }
})();
