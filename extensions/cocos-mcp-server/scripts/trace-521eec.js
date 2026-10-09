// Trace _0x521eec (the module in the error) and _0x2657c8 (action map) in knowledge-handler.js
const fs = require('fs');
const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

// 1. Find _0x2657c8 definition (action constants)
const defIdx = kh.indexOf('_0x2657c8=');
if (defIdx >= 0) {
    console.log('=== _0x2657c8 定义 ===');
    const ctx = kh.substring(defIdx, defIdx + 800);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    console.log(dec);
}

// 2. Find all _0x521eec usages
console.log('\n=== _0x521eec 用法 ===');
let idx = 0, count = 0;
const seen = new Set();
while ((idx = kh.indexOf('_0x521eec', idx)) >= 0 && count < 30) {
    count++;
    const ctx = kh.substring(idx, idx + 150);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    if (!seen.has(dec)) {
        seen.add(dec);
        console.log('[' + count + '] ' + dec);
        console.log('');
    }
    idx += 9;
}
console.log('total _0x521eec refs:', count);
