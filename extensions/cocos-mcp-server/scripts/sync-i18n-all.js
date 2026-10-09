// Sync rm_* i18n keys to all 9 non-en/zh language files (use English values as fallback)
const fs = require('fs');
const path = require('path');

const rmKeys = {
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
};

const langs = ['ja', 'ko', 'fr', 'de', 'es', 'ru', 'vi', 'ar', 'pt'];
const i18nDir = path.resolve(__dirname, '..', 'i18n');

for (const lang of langs) {
    const fp = path.join(i18nDir, lang + '.js');
    let content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');

    // Find the last }; line
    let braceLine = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '};') { braceLine = i; break; }
    }
    if (braceLine < 0) { console.log(lang + ': NO CLOSING };'); continue; }

    // Ensure last key has trailing comma
    let lastNonEmptyLine = -1;
    for (let i = braceLine - 1; i >= 0; i--) {
        if (lines[i].trim().length > 0) { lastNonEmptyLine = i; break; }
    }
    if (lastNonEmptyLine >= 0 && !lines[lastNonEmptyLine].trimEnd().endsWith(',')) {
        lines[lastNonEmptyLine] = lines[lastNonEmptyLine].trimEnd() + ',';
    }

    // Build new lines
    const sortedKeys = Object.keys(rmKeys).sort();
    const newLines = sortedKeys.map(function (k, idx) {
        var v = rmKeys[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var comma = idx < sortedKeys.length - 1 ? ',' : '';
        return '    "' + k + '": "' + v + '"' + comma;
    });

    lines.splice(braceLine, 0, ...newLines);
    content = lines.join('\n');
    fs.writeFileSync(fp, content, 'utf8');

    delete require.cache[require.resolve(fp)];
    const loaded = require(fp);
    console.log(lang + ': ' + Object.keys(loaded).length + ' keys');
}
