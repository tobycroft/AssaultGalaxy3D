// Test: only tools/call captured, natural language label
const fs = require('fs');
try { fs.unlinkSync('../dist/request-monitor-debug.log'); } catch (e) {}

delete require.cache[require.resolve('../dist/request-monitor-hook')];
const hook = require('../dist/request-monitor-hook');

const http = require('http');
const server = http.createServer((req, res) => { res.writeHead(200); res.end('{}'); });

server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;

    function send(payload) {
        return new Promise((resolve) => {
            const req = http.request({ hostname: '127.0.0.1', port, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
                res.on('data', () => {});
                res.on('end', () => resolve());
            });
            req.write(JSON.stringify(payload));
            req.end();
        });
    }

    (async () => {
        // Scenario 1: user says "你好" — AI doesn't call Cocos tools at all
        // But in MCP terms, initialize happens at connection
        console.log('场景1: 连接初始化 (initialize)');
        await send({ jsonrpc: '2.0', method: 'initialize', params: {}, id: 1 });

        console.log('场景2: 获取工具列表 (tools/list)');
        await send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 });

        console.log('场景3: 用户说"创建一个节点叫做ground" (tools/call)');
        await send({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'cocos_node', arguments: { action: 'create_node', name: 'ground' } }, id: 3 });

        await new Promise(r => setTimeout(r, 300));

        console.log('');
        console.log('=== Hook 结果 ===');
        console.log('entries:', hook.count(), '(期望 1 — 只捕获 tools/call)');
        hook.getAll().forEach(e => {
            console.log('  toolName:', e.toolName);
            console.log('  params:', JSON.stringify(e.params));
            console.log('  status:', e.status, 'duration:', e.duration + 'ms');
        });

        console.log('');
        console.log('=== Debug log ===');
        try {
            console.log(fs.readFileSync('../dist/request-monitor-debug.log', 'utf8'));
        } catch (e) { console.log('(no log)'); }

        server.close();
        process.exit(0);
    })();
});
