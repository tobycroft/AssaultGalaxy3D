/**
 * Cocos MCP Server v2.8.0 — Panel Utilities
 * All functions attached to window. Uses only expression syntax (no blocks).
 * Bootstrapped via DOM appendChild of a script element.
 */
(function() {
  if (window.__mcpLoaded) return;
  window.__mcpLoaded = true;

  // ---- Editor configs ----
  window.__ED = {
    vscode:        ['VS Code',              '.vscode/mcp.json 或 settings.json', '{\n  "servers": {\n    "cocos-creator": {\n      "type": "http",\n      "url": "http://127.0.0.1:3000/mcp"\n    }\n  }\n}'],
    cursor:        ['Cursor',               'settings.json -> mcpServers',       '"cocos-creator": { "url": "http://127.0.0.1:3000/mcp" }'],
    windsurf:      ['Windsurf',             'settings.json -> mcpServers',       '"cocos-creator": { "url": "http://127.0.0.1:3000/mcp" }'],
    trae:          ['Trae / Trae CN',       'settings.json -> mcpServers',       '"cocos-creator": { "url": "http://127.0.0.1:3000/mcp" }'],
    zed:           ['Zed',                  '~/.config/zed/settings.json',       '{ "mcp_servers": { "cocos-creator": { "url": "http://127.0.0.1:3000/mcp", "type": "http" } } }'],
    jetbrains:     ['JetBrains AI',         'IDE settings -> AI Assistant',      '{ "mcpServers": { "cocos-creator": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }'],
    'claude-desktop': ['Claude Desktop',    'claude_desktop_config.json',        '{\n  "mcpServers": {\n    "cocos-creator": {\n      "type": "http",\n      "url": "http://127.0.0.1:3000/mcp"\n    }\n  }\n}'],
    'claude-code':  ['Claude Code',         '终端执行此命令',                     'claude mcp add cocos-creator http://127.0.0.1:3000/mcp --transport http'],
    codex:          ['Codex CLI',           '终端执行此命令',                     'codex mcp add cocos-creator --url http://127.0.0.1:3000/mcp --transport http'],
    gemini:         ['Gemini CLI',          '终端执行此命令',                     'gemini mcp add cocos-creator http://127.0.0.1:3000/mcp'],
    aider:          ['Aider',               '终端执行或 .aider.conf.yml',         'aider --mcp-url http://127.0.0.1:3000/mcp'],
    goose:          ['Goose',               '~/.goose/config.json',              '{ "mcp_servers": { "cocos-creator": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }'],
    kilo:           ['Kiro/Qoder/Devin/Codeium','编辑器 MCP 设置页面',           '{ "mcpServers": { "cocos-creator": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }'],
    web:            ['Replit/Bolt/Lovable/v0',  '项目 Settings -> MCP',          '{ "mcpServers": { "cocos-creator": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }']
  };

  // ---- Editor: add row from template ----
  window.edAddFromTpl = function(key) {
    var d = window.__ED[key];
    if (!d) return;
    var el = document.getElementById('editorEmpty');
    el && (el.style.display = 'none');
    if (document.getElementById('er-' + key)) return;

    var row = document.createElement('div');
    row.className = 'editor-config-row-new';
    row.id = 'er-' + key;
    row.innerHTML =
      '<div class="ecr-left">' +
        '<span class="ecr-name">' + d[0] + '</span>' +
        '<span class="ecr-hint">' + d[1] + '</span>' +
      '</div>' +
      '<div class="ecr-right">' +
        '<pre class="ecr-config">' + escHtml(d[2]) + '</pre>' +
        '<button class="ecr-copy-btn" title="复制" onclick="edCopy(\'' + key + '\',this)">📋</button>' +
        '<button class="ecr-del-btn" title="删除" onclick="edDel(\'' + key + '\')">×</button>' +
      '</div>';
    document.getElementById('editorConfigList').appendChild(row);

    var det = document.querySelector('.editors-add-wrap');
    det && det.open && (det.open = false);
  };

  // ---- Editor: delete row ----
  window.edDel = function(key) {
    var row = document.getElementById('er-' + key);
    row && row.remove();
    var list = document.getElementById('editorConfigList');
    if (list && list.querySelectorAll && !list.querySelector('.editor-config-row-new')) {
      var empt = document.getElementById('editorEmpty');
      empt && (empt.style.display = 'block');
    }
  };

  // ---- Editor: copy config ----
  window.edCopy = function(key, btn) {
    var d = window.__ED[key];
    if (!d) return;
    var txt = d[2];
    var done = function() {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = '📋'; btn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(function() {
        fallbackCopy(key, txt) && done();
      });
    } else {
      fallbackCopy(key, txt) && done();
    }
  };

  function fallbackCopy(key, txt) {
    var pre = document.querySelector('#er-' + key + ' .ecr-config');
    if (!pre) return false;
    var range = document.createRange();
    range.selectNodeContents(pre);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand('copy'); return true; }
    catch(e) { return false; }
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Ping ----
  var pt = 3000;
  var ob = new MutationObserver(function() {
    var c = document.querySelector('.conn-url');
    if (c && c.textContent) {
      var m = c.textContent.match(/:(\d+)\//);
      m && (pt = parseInt(m[1]));
    }
  });
  ob.observe(document.body, { childList: true, subtree: true });

  window.doPing = function() {
    var i = document.getElementById('pingIcon');
    var l = document.getElementById('pingLabel');
    var r = document.getElementById('pingResult');
    var b = document.getElementById('pingBtn');
    if (!i || !b) return;
    i.textContent = '⏳'; l.textContent = 'Pinging...';
    b.className = 'ping-btn ping-loading'; r.style.display = 'none';
    var ac = new AbortController();
    var to = setTimeout(function() { ac.abort(); }, 5000);
    fetch('http://127.0.0.1:' + pt + '/health', { signal: ac.signal })
      .then(function(res) { clearTimeout(to); if (!res.ok) throw 'ERR'; return res.json(); })
      .then(function(d) {
        i.textContent = '✅'; l.textContent = 'Connected';
        b.className = 'ping-btn ping-ok'; r.style.display = 'inline-block';
        r.className = 'ping-result ping-result-ok';
        r.textContent = (d.tools || '?') + ' tools';
      })
      .catch(function() {
        clearTimeout(to);
        i.textContent = '❌'; l.textContent = 'Failed';
        b.className = 'ping-btn ping-fail'; r.style.display = 'inline-block';
        r.className = 'ping-result ping-result-fail';
        r.textContent = 'Unreachable';
      });
  };
})();
