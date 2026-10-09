// Execute knowledge handler, instantiate class, invoke tool_guide
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

const accessedProps = [];
const clientProxy = new Proxy({}, {
    get: function (target, prop) {
        if (typeof prop === 'string' && !['then', 'inspect', 'valueOf', 'toString', 'length', 'name', 'caller', 'arguments', 'prototype', 'constructor', Symbol.toPrimitive, Symbol.toStringTag, Symbol.iterator].includes(prop) && !prop.startsWith('_')) {
            accessedProps.push(prop);
            console.log('PROP ACCESS on knowledge-client:', prop);
        }
        return function () { return Promise.resolve({ data: {}, success: true }); };
    }
});

const mod = { exports: {} };
const sandbox = {
    require: function (req) {
        if (req.includes('knowledge-client')) return clientProxy;
        if (req.includes('param-validator')) return { validateArgs: function () { return null; } };
        if (req.includes('tool-guides')) return {};
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
    console.log('KnowledgeHandler:', typeof HandlerClass);

    // Instantiate and find its methods
    const instance = new HandlerClass();
    const protoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
    console.log('Instance methods:', protoMethods.filter(m => m !== 'constructor'));

    // Invoke methods with tool_guide payload
    for (const m of protoMethods) {
        if (m === 'constructor') continue;
        if (typeof instance[m] !== 'function') continue;
        console.log('\n=== 调用 instance.' + m + ' with tool_guide ===');
        try {
            const result = instance[m]({ action: 'tool_guide', topic: 'cocos_scene' }, {});
            if (result && typeof result.then === 'function') {
                result
                    .then(r => console.log('  result:', JSON.stringify(r).substring(0, 200)))
                    .catch(e => console.log('  ASYNC THREW:', e.message.substring(0, 150)));
            } else {
                console.log('  sync result:', JSON.stringify(result).substring(0, 200));
            }
        } catch (e) {
            console.log('  THREW:', e.message.substring(0, 150));
        }
    }
} catch (e) {
    console.log('Load error:', e.message.substring(0, 200));
    console.log(e.stack.split('\n').slice(0, 5).join('\n'));
}
console.log('\n=== 总计属性访问 ===');
console.log([...new Set(accessedProps)].join(', '));
