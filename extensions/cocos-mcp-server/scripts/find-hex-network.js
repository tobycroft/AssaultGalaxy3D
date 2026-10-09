// Search for hex-encoded network strings in mcp-server.js
const fs = require('fs');
const ms = fs.readFileSync('dist/mcp-server.js', 'utf8');

function hex(str) {
    return str.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const targets = ['http', 'https', 'listen', 'createServer', 'Server', 'socket', 'net', 'createConnection', 'address', 'request', 'response', 'writeHead', 'setHeader', 'headers', 'statusCode', 'IncomingMessage', 'ServerResponse', 'tcp', 'fetch', 'XMLHttpRequest'];

console.log('=== hex 编码网络关键词搜索 ===');
for (const t of targets) {
    const h = hex(t);
    const n = (ms.split(h).length - 1);
    if (n > 0) console.log(t + ' (\\x hex):', n);
}

// Also search mixed-case hex and plain
console.log('');
console.log('=== 明文搜索（不分大小写） ===');
for (const t of ['HTTP', 'Http', 'http', 'LISTEN', 'Listen', 'SOCKET', 'Socket']) {
    const n = (ms.split(t).length - 1);
    if (n > 0) console.log(t + ':', n);
}
