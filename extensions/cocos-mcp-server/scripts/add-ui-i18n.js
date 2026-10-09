// Add panel UI i18n keys to en.js and zh.js
const fs = require('fs');
const path = require('path');

const keys = {
    en: {
        rm_empty: 'No requests yet. Connect an AI client to see requests here.',
        rm_count: '{0} requests',
        rm_filter_placeholder: 'Filter by tool name...',
        rm_clear: 'Clear',
        rm_pending: 'Pending',
        rm_success: 'Success',
        rm_error: 'Error',
        rm_batch: 'Batch',
        rm_method_call: 'call',
        rm_method_list: 'list',
        rm_method_initialize: 'init',
        rm_method_notification: 'notify',
        rm_method_unknown: '?',
    },
    zh: {
        rm_empty: '暂无请求。连接 AI 客户端后将在此显示请求。',
        rm_count: '共 {0} 条请求',
        rm_filter_placeholder: '按工具名筛选...',
        rm_clear: '清空',
        rm_pending: '处理中',
        rm_success: '成功',
        rm_error: '失败',
        rm_batch: '批量',
        rm_method_call: '调用',
        rm_method_list: '列表',
        rm_method_initialize: '初始化',
        rm_method_notification: '通知',
        rm_method_unknown: '?',
    },
};

const i18nDir = path.resolve(__dirname, '..', 'i18n');
for (const [lang, newKeys] of Object.entries(keys)) {
    const fp = path.join(i18nDir, lang + '.js');
    let content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');

    // Find the last }; line
    let braceLine = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '};') { braceLine = i; break; }
    }
    if (braceLine < 0) { console.log(lang + ': NO CLOSING };'); continue; }

    // Check if last key line has trailing comma
    let lastNonEmpty = '';
    for (let i = braceLine - 1; i >= 0; i--) {
        const t = lines[i].trim();
        if (t.length > 0) { lastNonEmpty = t; break; }
    }
    if (!lastNonEmpty.endsWith(',')) {
        // Add comma to last key line
        for (let i = braceLine - 1; i >= 0; i--) {
            const t = lines[i].trim();
            if (t.length > 0 && t !== '};') {
                lines[i] = lines[i].trimEnd() + ',';
                break;
            }
        }
    }

    // Build new lines (sorted by key for consistency)
    const sortedKeys = Object.keys(newKeys).sort();
    const newLines = sortedKeys.map(function (k) {
        var v = newKeys[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return '    "' + k + '": "' + v + '",';
    });
    // Remove trailing comma from last new key
    newLines[newLines.length - 1] = newLines[newLines.length - 1].replace(/",$/, '"');

    // Insert before };
    lines.splice(braceLine, 0, ...newLines);
    content = lines.join('\n');

    fs.writeFileSync(fp, content, 'utf8');

    // Verify
    delete require.cache[require.resolve(fp)];
    const loaded = require(fp);
    console.log(lang + ': ' + Object.keys(loaded).length + ' keys, rm_empty=' + !!loaded.rm_empty);
}
