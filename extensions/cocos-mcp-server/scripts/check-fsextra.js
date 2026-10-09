// Check fs-extra vs native fs usage in panel
const fs = require('fs');
function hex(s) { return s.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''); }

const p = fs.readFileSync('dist/panels/default/index.js', 'utf8');
for (const fr of ['fs-extra', '-extra', 'extra']) {
    const h = hex(fr);
    console.log(fr + ':', (p.split(h).length - 1));
}
console.log('fs (原生2字母):', (p.split(hex('fs')).length - 1));

// Also check the require paths decoded from panel (we know from deobfuscation it used fs.readFileSync)
// Search readFileSync hex
console.log('readFileSync:', (p.split(hex('readFileSync')).length - 1));
console.log('readFile:', (p.split(hex('readFile')).length - 1));
