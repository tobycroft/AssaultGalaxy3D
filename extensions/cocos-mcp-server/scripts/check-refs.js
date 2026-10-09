const fs = require('fs');

// Check panel/index.js for cocos-mcp-server
const panel = fs.readFileSync('dist/panels/default/index.js', 'utf8');
console.log('panel/index.js length:', panel.length);

// Search for 'cocos-mcp-server' in panel file
const panelMatches = panel.match(/cocos-mcp-server/g);
console.log('cocos-mcp-server in panel/index.js:', panelMatches ? panelMatches.length : 0);

// Search for raw 'default' string in panel file context
const defaultIdx = panel.indexOf("default");
console.log('First "default" at position:', defaultIdx);
if (defaultIdx >= 0) {
    console.log('Context:', JSON.stringify(panel.substring(defaultIdx - 30, defaultIdx + 80)));
}

// Also check scene.js
const scene = fs.readFileSync('dist/scene.js', 'utf8');
const sceneMatches = scene.match(/cocos-mcp-server/g);
console.log('cocos-mcp-server in scene.js:', sceneMatches ? sceneMatches.length : 0);

// Check mcp-server.js
const server = fs.readFileSync('dist/mcp-server.js', 'utf8');
const serverMatches = server.match(/cocos-mcp-server/g);
console.log('cocos-mcp-server in mcp-server.js:', serverMatches ? serverMatches.length : 0);

// Check all files with this string
console.log('\n=== Full search for cocos-mcp-server ===');
const path = require('path');
const BASE = path.resolve(__dirname, '..');

function searchDir(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git' && e.name !== '.vscode') {
            searchDir(fp);
        } else if (e.name.endsWith('.js') || e.name.endsWith('.json') || e.name.endsWith('.html')) {
            const content = fs.readFileSync(fp, 'utf8');
            if (content.includes('cocos-mcp-server')) {
                console.log('  Found in: ' + path.relative(BASE, fp));
            }
        }
    }
}
searchDir(BASE);
