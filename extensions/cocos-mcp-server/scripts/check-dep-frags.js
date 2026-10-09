// Check dependency fragment usage in obfuscated code + node_modules size
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function hex(s) {
    return s.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const files = execSync('find dist -name "*.js"').toString().trim().split('\n').filter(Boolean);

const frags = ['toml', 'fs-extra', 'puppeteer', 'chrome', 'uuid', 'vue'];
console.log('=== 分片搜索（hex 编码） ===');
for (const fr of frags) {
    const h = hex(fr);
    let total = 0, locs = [];
    for (const f of files) {
        try {
            const c = fs.readFileSync(f, 'utf8');
            const n = (c.split(h).length - 1);
            if (n > 0) {
                total += n;
                if (locs.length < 3) locs.push(f.replace(/\\/g, '/').replace('dist/', ''));
            }
        } catch (e) {}
    }
    console.log(fr + ': ' + total + (locs.length ? ' → ' + locs.join(', ') : ''));
}

function dirSize(d) {
    let total = 0;
    try {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) total += dirSize(p);
            else total += fs.statSync(p).size;
        }
    } catch (e) {}
    return total;
}
console.log('');
console.log('node_modules 总大小:', (dirSize('node_modules') / 1024 / 1024).toFixed(1) + ' MB');
console.log('dist 总大小:', (dirSize('dist') / 1024 / 1024).toFixed(1) + ' MB');
console.log('整个插件（不含 node_modules）:', ((dirSize('dist') + dirSize('static') + dirSize('i18n') + dirSize('scripts') + dirSize('settings') + dirSize('prompts')) / 1024 / 1024).toFixed(1) + ' MB');
