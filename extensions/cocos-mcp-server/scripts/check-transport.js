// Check what transport the MCP server actually uses
const fs = require('fs');
const ms = fs.readFileSync('dist/mcp-server.js', 'utf8');
console.log('File size:', ms.length);

const keywords = [
    'net', 'socket', 'tcp', 'stream', 'fetch', 'WebSocket', 'sse', 'SSE',
    'transport', 'Transport', 'duplex', 'Duplex', 'readable', 'Readable',
    'pipe', 'response', 'Response', 'request', 'Request', 'messaging',
    'MessageChannel', 'Server', 'server', 'express', 'koa', 'fastify',
    'bridge', 'Bridge', 'port', 'Port', 'tcpPort', 'listen', 'Listen'
];
for (const k of keywords) {
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const n = (ms.match(re) || []).length;
    if (n > 0) console.log(k + ':', n);
}

console.log('');
// Also search for the readable plaintext strings in the file
const readable = ms.match(/[a-zA-Z_]{4,}/g) || [];
const wordCount = {};
for (const w of readable) {
    if (['function','return','const','let','var','null','undefined','this','new','require','module','exports','catch','try','while','else','if','void','String','Object','Number','parseInt','push','shift','break','true','false','case','switch','typeof','delete','continue','async','await','class','extends','super','import','from','default','for','of','in','do'].includes(w)) continue;
    wordCount[w] = (wordCount[w] || 0) + 1;
}
const sorted = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 60);
console.log('\n=== 高频明文词汇 (前60) ===');
for (const [w, n] of sorted) {
    console.log(w + ': ' + n);
}
