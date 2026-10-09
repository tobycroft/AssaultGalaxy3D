// Decode the knowledge-handler.js structure more deeply
const fs = require('fs');
const vm = require('vm');

// Execute the file in a VM sandbox to capture the real code structure
const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// We can't fully execute (requires Editor etc), but we can instrument:
// Patch the require calls to log what's being required
const sandbox = {
    require: function (mod) {
        console.log('REQUIRE:', mod);
        return {};
    },
    module: { exports: {} },
    exports: {},
    __dirname: 'D:/AIworking/cocos-mcp/dist/tools/cocos/handlers',
    global: null,
    console: console,
    process: process,
    Buffer: Buffer,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
};
sandbox.global = sandbox;
vm.createContext(sandbox);

try {
    vm.runInContext(kh, sandbox, { timeout: 2000 });
} catch (e) {
    // We expect errors since requires return {} — but we want the require log
    console.log('\nExecution stopped (expected):', e.message.substring(0, 120));
}
