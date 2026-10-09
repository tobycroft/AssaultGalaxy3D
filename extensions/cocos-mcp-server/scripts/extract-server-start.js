// Extract and decode startServerProcess from main.js
const fs = require('fs');
const ms = fs.readFileSync('dist/main.js', 'utf8');

const startIdx = ms.indexOf('async function startServerProcess');
if (startIdx < 0) { console.log('startServerProcess not found'); process.exit(1); }

// Extract ~2000 chars and decode all \xNN hex escapes
const chunk = ms.substring(startIdx, startIdx + 2500);
const decoded = chunk.replace(/\\x([0-9a-f]{2})/g, function(m, h) {
    var c = String.fromCharCode(parseInt(h, 16));
    return (c >= ' ' && c <= '~') ? c : '·';
});

console.log(decoded.substring(0, 2500));
