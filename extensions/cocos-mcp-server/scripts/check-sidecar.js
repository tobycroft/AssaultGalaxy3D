// Check sidecar/child-process architecture
const fs = require('fs');
const ms = fs.readFileSync('dist/main.js', 'utf8');
console.log('main.js 子进程相关:');
for (const k of ['child_process', 'spawn', 'fork', 'execFile', 'execSync', 'spawnSync', 'sidecar', 'Sidecar', 'SidecarExecutor', 'Process']) {
    const n = (ms.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (n > 0) console.log(' ', k + ':', n);
}

const sc = fs.readFileSync('dist/sidecar-executor.js', 'utf8');
console.log('');
console.log('sidecar-executor.js (' + sc.length + ' bytes):');
for (const k of ['http', 'createServer', 'listen', 'Server', 'spawn', 'fork', 'exec', 'port', 'sse', 'stream', 'child_process', 'net']) {
    const n = (sc.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (n > 0) console.log(' ', k + ':', n);
}

// High-frequency readable words in sidecar-executor
console.log('');
const readable = sc.match(/[a-zA-Z_]{4,}/g) || [];
const wc = {};
for (const w of readable) {
    if (['function','return','const','let','var','null','undefined','this','new','require','module','exports','catch','try','while','else','if','void','String','Object','Number','parseInt','push','shift','break','true','false','case','switch','typeof','delete','continue','async','await','class','extends','super','default'].includes(w)) continue;
    wc[w] = (wc[w] || 0) + 1;
}
const sorted = Object.entries(wc).sort((a,b) => b[1]-a[1]).slice(0, 40);
for (const [w, n] of sorted) console.log('  ' + w + ': ' + n);

// Check where MCP server is created - main.js context
console.log('');
console.log('main.js 中 MCPServer 引用:');
let idx = 0, count = 0;
while ((idx = ms.indexOf('MCPServer', idx)) >= 0 && count < 5) {
    count++;
    const ctx = ms.substring(Math.max(0, idx - 50), idx + 80);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function(m, h) { var c = String.fromCharCode(parseInt(h,16)); return (c >= ' ' && c <= '~') ? c : '.'; });
    console.log('  [' + count + '] ...' + dec + '...');
    idx += 9;
}
