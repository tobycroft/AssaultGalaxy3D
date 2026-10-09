const fs = require('fs');
const fp = 'static/template/vue/mcp-server-app.html';
let vue = fs.readFileSync(fp, 'utf8');

// Remove requests tab button
vue = vue.replace(
    '        <button class="tab-button" :class="{ active: activeTab === \'requests\' }" @click="switchTab(\'requests\')">\n            <span class="tab-icon">📡</span>\n            <span>{{ t(\'request_monitor_title\') }}</span>\n        </button>\n',
    ''
);

// Remove requests tab content (from marker to end of its tab-content)
const marker = '<!-- ====== 请求监控 ====== -->';
const idx = vue.indexOf(marker);
if (idx >= 0) {
    // Find the </div> that closes the requests tab-content, then the closing </div> of mcp-app
    // The structure is: ...marker\n    <div class="tab-content"...>...</div>\n</div>
    const tabContentStart = vue.indexOf('<div class="tab-content" v-show="activeTab === \'requests\'">', idx);
    if (tabContentStart >= 0) {
        // Count divs to find matching close
        let depth = 0, pos = tabContentStart;
        while (pos < vue.length) {
            const open = vue.indexOf('<div', pos);
            const close = vue.indexOf('</div>', pos);
            if (close < 0) break;
            if (open >= 0 && open < close) { depth++; pos = open + 4; }
            else { depth--; pos = close + 6; if (depth === 0) break; }
        }
        vue = vue.substring(0, idx) + vue.substring(pos);
    }
}

// Clean up extra blank lines
vue = vue.replace(/\n\n\n+/g, '\n\n');

// Ensure proper ending
if (!vue.trimEnd().endsWith('</div>')) {
    vue = vue.trimEnd() + '\n</div>';
}

fs.writeFileSync(fp, vue, 'utf8');

const openDivs = (vue.match(/<div/g) || []).length;
const closeDivs = (vue.match(/<\/div>/g) || []).length;
console.log('Div balance:', openDivs, '/', closeDivs, openDivs === closeDivs ? '✅' : '❌');
console.log('Tab buttons:', (vue.match(/switchTab/g) || []).length);
console.log('Tab contents:', (vue.match(/tab-content/g) || []).length);
console.log('requests tab remains:', vue.includes('requests'));
