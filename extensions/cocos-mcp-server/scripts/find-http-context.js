// Show context of all hex-encoded 'http' occurrences in mcp-server.js
const fs = require('fs');
const ms = fs.readFileSync('dist/mcp-server.js', 'utf8');

const hexHttp = '\\x68\\x74\\x74\\x70';
let idx = 0, count = 0;
while ((idx = ms.indexOf(hexHttp, idx)) >= 0) {
    count++;
    const ctx = ms.substring(Math.max(0, idx - 60), idx + 150);
    // decode all \xNN in context
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function(m, h) {
        var c = String.fromCharCode(parseInt(h, 16));
        return (c >= ' ' && c <= '~') ? c : '·';
    });
    console.log('[' + count + '] ...' + dec + '...');
    console.log('');
    idx += hexHttp.length;
}

// Also look for require calls near the top
console.log('=== require 语句 ===');
const reqRe = /require\(\\x[0-9a-f]+(?:\\x[0-9a-f]{2})*\)/g;
let m;
const reqs = new Set();
while ((m = reqRe.exec(ms)) !== null) {
    const dec = m[0].replace(/\\x([0-9a-f]{2})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
    reqs.add(dec);
}
console.log([...reqs].join('\n'));
