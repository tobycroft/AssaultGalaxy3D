// Check which npm packages the obfuscated dist code actually requires (hex-encoded)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function hex(str) {
    return str.split('').map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const packages = {
    '@iarna/toml': 'TOML 解析',
    'fs-extra': '文件系统扩展',
    'puppeteer-core': '无头浏览器',
    'uuid': 'UUID 生成',
    'vue': 'Vue 框架',
};

// Collect all dist files
const files = execSync('find dist -name "*.js" -not -path "*/node_modules/*"').toString().trim().split('\n').filter(Boolean);

console.log('=== 混淆代码实际引用的依赖（hex 编码搜索）===');
for (const [pkg, desc] of Object.entries(packages)) {
    const h = hex(pkg);
    let total = 0;
    let locations = [];
    for (const f of files) {
        try {
            const c = fs.readFileSync(f, 'utf8');
            const n = (c.split(h).length - 1);
            if (n > 0) {
                total += n;
                if (locations.length < 3) locations.push(f.replace(/\\/g, '/').replace('dist/', ''));
            }
        } catch (e) {}
    }
    console.log(pkg + ' (' + desc + '): ' + total + ' 处' + (locations.length ? ' → ' + locations.join(', ') : ''));
}

// Also check node_modules total size
console.log('');
const size = execSync('du -sh node_modules 2>/dev/null || echo "?"').toString().trim();
console.log('node_modules 总大小:', size);

// Check which node_modules packages are needed by package.json deps only
const deps = require(path.resolve('package.json')).dependencies || {};
console.log('');
console.log('package.json 声明的依赖:');
for (const [name, ver] of Object.entries(deps)) {
    const exists = fs.existsSync(path.resolve('node_modules', name));
    console.log('  ' + name + ' @ ' + ver + (exists ? ' ✅ 已安装' : ' ❌ 缺失'));
}
