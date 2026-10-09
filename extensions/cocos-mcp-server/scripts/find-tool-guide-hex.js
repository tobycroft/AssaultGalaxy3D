// Search hex-encoded action names in knowledge-handler.js
const fs = require('fs');
const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

function hex(str) {
    return str.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const targets = ['tool_guide', 'component_properties', 'best_practices', 'tool-guides', 'tool-guide', 'guides', 'guide'];

console.log('=== hex 编码搜索 ===');
for (const t of targets) {
    const h = hex(t);
    const n = (kh.split(h).length - 1);
    if (n > 0) console.log(t + ': ' + n);
    else console.log(t + ': 0');
}

// If tool_guide found, show contexts
const hGuide = hex('tool_guide');
let idx = 0, count = 0;
console.log('');
console.log('=== tool_guide hex 上下文 ===');
while ((idx = kh.indexOf(hGuide, idx)) >= 0 && count < 8) {
    count++;
    const ctx = kh.substring(Math.max(0, idx - 100), idx + 200);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    console.log('[' + count + '] ...' + dec + '...');
    console.log('');
    idx += hGuide.length;
}
