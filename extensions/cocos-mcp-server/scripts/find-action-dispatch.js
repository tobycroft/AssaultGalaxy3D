// Find action dispatch logic in knowledge-handler.js
const fs = require('fs');
const kh = fs.readFileSync('dist/tools/cocos/handlers/knowledge-handler.js', 'utf8');

function hex(str) {
    return str.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

// Show context around component_properties (which WORKS)
const hCP = hex('component_properties');
const cpIdx = kh.indexOf(hCP);
if (cpIdx >= 0) {
    console.log('=== component_properties 上下文 (正常工作的) ===');
    const ctx = kh.substring(cpIdx - 300, cpIdx + 300);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    console.log(dec);
}

// Search for 'case' statements near these actions
console.log('\n=== case 语句 ===');
const caseRe = /case\s+[^:]+:/g;
let m, cases = [];
while ((m = caseRe.exec(kh)) !== null) {
    const s = m[0].replace(/\\x([0-9a-f]{2})/g, function (_, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    cases.push(s);
}
// Dedupe
const unique = [...new Set(cases)];
console.log(unique.join('\n'));
console.log('\n共 ' + unique.length + ' 个唯一 case');
