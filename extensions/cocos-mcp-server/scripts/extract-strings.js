// Extract string table from obfuscated main.js
const fs = require('fs');
const content = fs.readFileSync('dist/main.js', 'utf8');

// Find the string array
const match = content.match(/function _0x5be9\(\)\{const _0x[a-f0-9]+=\[(.*?)\];/s);
if (!match) {
    console.log('Could not find string array by pattern 1');
    // Try alternative pattern
    const m2 = content.match(/const _0x[a-f0-9]+=\[(.*?)\];function/s);
    if (!m2) {
        console.log('Could not find string array');
        process.exit(1);
    }
    process.exit(1);
}

const arrayContent = match[1];
// Parse each hex-encoded string: '\x41\x42\x43'
const strings = [];
const re = /'((?:\\x[0-9a-f]{2})+)'/g;
let m;
while ((m = re.exec(arrayContent)) !== null) {
    const hexStr = m[1];
    // convert \xHH sequences to actual bytes
    const parts = hexStr.split('\\x');
    const bytes = [];
    for (let i = 1; i < parts.length; i++) {
        bytes.push(parseInt(parts[i], 16));
    }
    strings.push(Buffer.from(bytes).toString('utf8'));
}

console.log('Total strings:', strings.length);
console.log('');
console.log('=== Strings containing "cocos" ===');
strings.forEach((s, i) => {
    if (s.toLowerCase().includes('cocos')) console.log('  [' + i + '] "' + s + '"');
});
console.log('');
console.log('=== Strings containing "panel" ===');
strings.forEach((s, i) => {
    if (s.toLowerCase().includes('panel')) console.log('  [' + i + '] "' + s + '"');
});
console.log('');
console.log('=== Strings containing "server" ===');
strings.forEach((s, i) => {
    if (s.toLowerCase().includes('server')) console.log('  [' + i + '] "' + s + '"');
});
console.log('');
console.log('=== Strings containing "mcp" ===');
strings.forEach((s, i) => {
    if (s.toLowerCase().includes('mcp')) console.log('  [' + i + '] "' + s + '"');
});
