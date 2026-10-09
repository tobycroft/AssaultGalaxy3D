const fs = require('fs');
const path = require('path');

const i18n = {
    ja: { request_monitor_title: 'リクエストモニター', open_request_monitor: 'リクエストモニターを開く', request_monitor_empty: 'まだリクエストはありません。AIクライアントを接続してください。', request_monitor_clear: 'クリア' },
    ko: { request_monitor_title: '요청 모니터', open_request_monitor: '요청 모니터 열기', request_monitor_empty: '아직 요청이 없습니다. AI 클라이언트를 연결하세요.', request_monitor_clear: '지우기' },
    fr: { request_monitor_title: 'Moniteur de Requêtes', open_request_monitor: 'Ouvrir le Moniteur', request_monitor_empty: "Aucune requête. Connectez un client IA pour voir les requêtes ici.", request_monitor_clear: 'Effacer' },
    de: { request_monitor_title: 'Anfragen-Monitor', open_request_monitor: 'Anfragen-Monitor öffnen', request_monitor_empty: 'Noch keine Anfragen. Verbinden Sie einen AI-Client.', request_monitor_clear: 'Löschen' },
    es: { request_monitor_title: 'Monitor de Peticiones', open_request_monitor: 'Abrir Monitor', request_monitor_empty: 'Sin peticiones aún. Conecte un cliente IA para verlas aquí.', request_monitor_clear: 'Limpiar' },
    ru: { request_monitor_title: 'Монитор Запросов', open_request_monitor: 'Открыть Монитор', request_monitor_empty: 'Запросов пока нет. Подключите AI клиент.', request_monitor_clear: 'Очистить' },
    vi: { request_monitor_title: 'Giám Sát Yêu Cầu', open_request_monitor: 'Mở Giám Sát', request_monitor_empty: 'Chưa có yêu cầu. Kết nối AI client để xem.', request_monitor_clear: 'Xóa' },
    ar: { request_monitor_title: 'مراقب الطلبات', open_request_monitor: 'فتح المراقب', request_monitor_empty: 'لا توجد طلبات بعد. قم بتوصيل عميل AI.', request_monitor_clear: 'مسح' },
    pt: { request_monitor_title: 'Monitor de Requisições', open_request_monitor: 'Abrir Monitor', request_monitor_empty: 'Nenhuma requisição. Conecte um cliente IA para ver.', request_monitor_clear: 'Limpar' },
};

const i18nDir = path.resolve(__dirname, '..', 'i18n');
for (const [lang, keys] of Object.entries(i18n)) {
    const fp = path.join(i18nDir, lang + '.js');
    let content = fs.readFileSync(fp, 'utf8');

    // Find the last }; and the line before it
    const lines = content.split('\n');
    let braceLine = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '};') { braceLine = i; break; }
    }
    if (braceLine < 0) { console.log(lang + ': NO CLOSING }; FOUND!'); continue; }

    // Check if previous line ends with a comma
    let prevContent = '';
    for (let i = braceLine - 1; i >= 0; i--) {
        const t = lines[i].trim();
        if (t.length > 0) { prevContent = t; break; }
    }

    // Build 4 new lines
    const newLines = [
        '    "request_monitor_title": "' + keys.request_monitor_title + '",',
        '    "open_request_monitor": "' + keys.open_request_monitor + '",',
        '    "request_monitor_empty": "' + keys.request_monitor_empty + '",',
        '    "request_monitor_clear": "' + keys.request_monitor_clear + '"',
    ];

    if (prevContent.endsWith(',')) {
        // No comma needed before new keys
    } else {
        // Add comma to the last key line
        for (let i = braceLine - 1; i >= 0; i--) {
            const t = lines[i].trim();
            if (t.length > 0 && t !== '};') {
                if (!lines[i].trimEnd().endsWith(',')) {
                    lines[i] = lines[i].trimEnd() + ',';
                }
                break;
            }
        }
    }

    // Insert new lines before };
    lines.splice(braceLine, 0, ...newLines);
    content = lines.join('\n');

    fs.writeFileSync(fp, content, 'utf8');

    // Verify
    delete require.cache[require.resolve(fp)];
    const loaded = require(fp);
    console.log(lang + ': ' + Object.keys(loaded).length + ' keys, rm=' + !!loaded.request_monitor_title);
}
