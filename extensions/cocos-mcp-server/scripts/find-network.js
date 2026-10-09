// Find the actual network layer in mcp-server.js
const fs = require('fs');
const ms = fs.readFileSync('dist/mcp-server.js', 'utf8');

// Search for network-related patterns
const patterns = [
    ['127.0.0.1', /127\.0\.0\.1/g],
    ['0.0.0.0', /0\.0\.0\.0/g],
    ['address()', /address\(\)/g],
    ['connection', /connection/g],
    ['Conn', /Conn/g],
    ['listen', /listen/g],
    ['Listen', /Listen/g],
    ['start()', /start\(/g],
    ['_server', /_server/g],
    ['fetch(', /fetch\(/g],
    ['Request', /Request/g],
    ['Response', /Response/g],
    ['req', /req\b/g],
    ['res', /res\b/g],
    ['body', /body/g],
    ['write', /write/g],
    ['end(', /end\(/g],
    ['onData', /onData/g],
    ['ondata', /ondata/g],
    ['handle', /handle/g],
    ['handleRequest', /handleRequest/g],
    ['Express', /Express/g],
];
console.log('=== 网络模式搜索 ===');
for (const [name, re] of patterns) {
    const n = (ms.match(re) || []).length;
    if (n > 0) console.log(name + ':', n);
}

// Decode readable strings around 'start'
console.log('\n=== start 方法上下文 ===');
let idx = 0, count = 0;
const re = /start/g;
while ((match = re.exec(ms)) !== null && count < 8) {
    count++;
    const pos = match.index;
    const ctx = ms.substring(Math.max(0, pos - 40), pos + 100);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function(m, h) { var c = String.fromCharCode(parseInt(h,16)); return (c >= ' ' && c <= '~') ? c : '.'; });
    console.log('[' + count + '] ...' + dec + '...');
}
