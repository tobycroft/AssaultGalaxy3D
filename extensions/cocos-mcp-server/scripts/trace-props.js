// Trace property access on knowledge-client (Proxy approach)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// Load real param-validator and tool-guides? No — we only need to capture
// what properties the handler accesses on the knowledge-client module.

const accessedProps = [];

// Proxy that logs property gets and returns a dummy function
const clientProxy = new Proxy({}, {
    get: function (target, prop) {
        if (typeof prop === 'string' && !prop.startsWith('_') && !['then', 'inspect', 'valueOf', 'toString', Symbol.toPrimitive].includes(prop)) {
            accessedProps.push(prop);
            console.log('PROP ACCESS on knowledge-client:', prop);
        }
        return function () { return Promise.resolve({}); };
    }
});

let reqCount = 0;
const sandbox = {
    require: function (mod) {
        reqCount++;
        console.log('REQUIRE #' + reqCount + ':', mod);
        if (mod.includes('knowledge-client')) return clientProxy;
        if (mod.includes('param-validator')) {
            return { validateArgs: function () { return null; } };
        }
        if (mod.includes('tool-guides')) {
            // Real tool-guides index
            try {
                return require('../dist/tools/cocos/data/tool-guides');
            } catch (e) {
                return {};
            }
        }
        return {};
    },
    module: { exports: {} }, exports: {},
    __dirname: path.resolve('dist/tools/cocos/handlers'),
    console: console, process: process, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    globalThis: null,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
    vm.runInContext(kh, sandbox, { timeout: 5000 });
    console.log('\n=== Module loaded, exports:', Object.keys(sandbox.module.exports));
} catch (e) {
    console.log('\nExecution error (may be expected):', e.message.substring(0, 150));
}
