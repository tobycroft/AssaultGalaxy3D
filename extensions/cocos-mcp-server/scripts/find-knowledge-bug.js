// Find tool_guide handling in knowledge-handler.js
const fs = require('fs');
const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');
console.log('knowledge-handler.js size:', kh.length);

// Search for tool_guide context (plaintext or hex)
const patterns = [
    'tool_guide',
    'component_properties',
    'best_practices',
    'tool-guides',
    'tool-guide',
    'toolGuide',
];
for (const p of patterns) {
    const n = (kh.split(p).length - 1);
    console.log(p + ':', n, 'occurrences');
}

// Show contexts around tool_guide
console.log('\n=== tool_guide 上下文 ===');
let idx = 0, count = 0;
while ((idx = kh.indexOf('tool_guide', idx)) >= 0 && count < 10) {
    count++;
    const ctx = kh.substring(Math.max(0, idx - 80), idx + 120);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    console.log('[' + count + '] ...' + dec + '...');
    console.log('');
    idx += 10;
}

// Readable words
console.log('=== 高频明文词汇 ===');
const readable = kh.match(/[a-zA-Z_]{4,}/g) || [];
const wc = {};
for (const w of readable) {
    if (['function', 'return', 'const', 'let', 'var', 'null', 'undefined', 'this', 'new', 'require', 'module', 'exports', 'catch', 'try', 'while', 'else', 'if', 'void', 'String', 'Object', 'Number', 'parseInt', 'push', 'shift', 'break', 'true', 'false', 'case', 'switch', 'typeof', 'delete', 'continue', 'async', 'await', 'class', 'extends', 'default'].includes(w)) continue;
    wc[w] = (wc[w] || 0) + 1;
}
const sorted = Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 50);
for (const [w, n] of sorted) console.log('  ' + w + ': ' + n);
