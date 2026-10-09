// Check puppeteer usage in capture-handler and whole dist
const fs = require('fs');
const { execSync } = require('child_process');

function hex(s) {
    return s.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

// 1. chrome contexts in capture-handler
const ch = fs.readFileSync('dist/tools/cocos/handlers/capture-handler.js', 'utf8');
const hexChrome = hex('chrome');
let idx = 0, count = 0;
console.log('=== capture-handler chrome 上下文 ===');
while ((idx = ch.indexOf(hexChrome, idx)) >= 0 && count < 4) {
    count++;
    const ctx = ch.substring(Math.max(0, idx - 60), idx + 60);
    const dec = ctx.replace(/\\x([0-9a-f]{2})/g, function (m, h) { var c = String.fromCharCode(parseInt(h, 16)); return (c >= ' ' && c <= '~') ? c : '·'; });
    console.log('[' + count + '] ...' + dec + '...');
    idx += hexChrome.length;
}

// 2. puppeteer fragments across all dist
const files = execSync('find dist -name "*.js"').toString().trim().split('\n').filter(Boolean);
console.log('');
console.log('=== puppeteer 分片搜索（全部 dist） ===');
for (const fr of ['pupp', 'eteer', 'launch', 'executablePath', 'headless']) {
    const h = hex(fr);
    let total = 0, locs = [];
    for (const f of files) {
        try {
            const c = fs.readFileSync(f, 'utf8');
            const n = (c.split(h).length - 1);
            if (n > 0) { total += n; if (locs.length < 3) locs.push(f.replace(/\\/g, '/').replace('dist/', '')); }
        } catch (e) {}
    }
    console.log(fr + ': ' + total + (locs.length ? ' → ' + locs.join(', ') : ''));
}

// 3. fs-extra fragments
console.log('');
console.log('=== fs-extra 分片搜索 ===');
for (const fr of ['fs-extra', 'fs_extra', 'readJson', 'writeJson', 'ensureDir', 'outputFile', 'copySync', 'readFileSync', 'writeFileSync']) {
    const h = hex(fr);
    let total = 0;
    for (const f of files) {
        try {
            const c = fs.readFileSync(f, 'utf8');
            total += (c.split(h).length - 1);
        } catch (e) {}
    }
    console.log(fr + ': ' + total);
}
