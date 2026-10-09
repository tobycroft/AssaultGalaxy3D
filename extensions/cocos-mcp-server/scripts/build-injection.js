/**
 * Build the injection snippet for dist/panels/default/index.js
 * Creates the "Requests" tab entirely via DOM — no template changes needed.
 */
const INJECTION = `'use strict';
// ==== Request Monitor (DOM-injected, no template changes) ====
(function () {
  var started = false, allEntries = [], filterText = '';
  function esc(s) {
    if (typeof s !== 'string') s = JSON.stringify(s);
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function summarize(obj) {
    if (!obj || Object.keys(obj).length === 0) return '(no params)';
    try { var s = JSON.stringify(obj); return s.length > 120 ? s.substring(0, 120) + '...' : s; }
    catch (e) { return String(obj); }
  }
  function fmtTime(iso) {
    if (!iso) return ''; var d = new Date(iso);
    return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2);
  }
  function poll() {
    if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
      Editor.Message.request('cocos-mcp', 'get-request-history', 200)
        .then(function (data) { allEntries = Array.isArray(data) ? data : []; render(); })
        .catch(function (e) { console.error('[RM] poll failed:', (e&&e.message)||e); });
    }
  }
  function clearAll() {
    if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
      Editor.Message.request('cocos-mcp', 'clear-request-history')
        .then(function () { allEntries = []; render(); })
        .catch(function (e) { console.error('[RM] clear failed:', (e&&e.message)||e); });
    }
  }
  function render() {
    var listEl = document.getElementById('rmList');
    var countEl = document.getElementById('rmCount');
    if (!listEl || !countEl) { console.error('[RM] render: missing #rmList/#rmCount'); return; }
    var list = allEntries;
    if (filterText) {
      var ft = filterText.toLowerCase();
      list = list.filter(function(r){ return r.toolName && r.toolName.toLowerCase().indexOf(ft) !== -1; });
    }
    countEl.textContent = list.length;
    if (list.length === 0) {
      listEl.innerHTML = '<div class=\"rm-empty\" style=\"text-align:center;color:#8b95a5;padding:48px 20px;font-size:14px\">No requests yet. Connect an AI client to see requests here.</div>';
      return;
    }
    var stick = (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight) < 40;
    var html = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var r = list[i];
      var sc = r.status === 'error' ? 'error' : (r.status === 'pending' ? 'pending' : 'success');
      var dc = r.duration > 2000 ? 'very-slow' : (r.duration > 500 ? 'slow' : '');
      html += '<div class=\"rm-item\" data-id=\"'+r.id+'\" style=\"display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#fff;border:1px solid #e2e6ea;border-radius:6px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);cursor:pointer;transition:all .15s\" onmouseover=\"this.style.background=\\'#eff6ff\\';this.style.borderColor=\\'#bfdbfe\\'\" onmouseout=\"this.style.background=\\'#fff\\';this.style.borderColor=\\'#e2e6ea\\'\">'+
        '<div style=\"width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:3px;background:'+(sc==='success'?'#16a34a':sc==='error'?'#dc2626':'#ea580c')+';box-shadow:0 0 10px '+(sc==='success'?'rgba(22,163,74,.35)':sc==='error'?'rgba(220,38,38,.35)':'rgba(234,88,12,.35)')+'\"></div>'+
        '<div style=\"flex:1;min-width:0\">'+
          '<div style=\"display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px\">'+
            '<span style=\"font-size:11px;color:#8b95a5;font-family:monospace\">'+esc(fmtTime(r.timestamp))+'</span>'+
            '<span style=\"font-size:10px;color:#8b95a5;background:#f1f5f9;padding:1px 8px;border-radius:4px\">'+(r.method==='tools/call'?'call':(r.method||'?'))+'</span>'+
            '<span style=\"font-size:11px;font-weight:700;color:#2563eb;background:#eff6ff;padding:2px 10px;border-radius:4px;font-family:monospace;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\" title=\"'+esc(r.toolName)+'\">'+esc(r.toolName)+'</span>'+
            '<span style=\"font-size:11px;color:#4a5568;font-family:monospace;margin-left:auto\">'+r.duration+'ms</span>'+
          '</div>'+
          '<div style=\"font-size:11px;color:#4a5568;background:#f8fafc;padding:4px 10px;border-radius:4px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer\" class=\"rm-pp\">'+esc(summarize(r.params))+'</div>'+
          '<div style=\"display:none;background:#1e293b;color:#7dd3fc;padding:10px 14px;border-radius:6px;font-family:monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin-top:6px\" class=\"rm-pf\">'+(r.params?esc(JSON.stringify(r.params,null,2)):'')+'</div>'+
          (r.error?'<div style=\"font-size:11px;color:#dc2626;background:#fef2f2;padding:3px 10px;border-radius:4px;margin-top:4px\">'+esc(r.error)+'</div>':'')+
        '</div>'+
      '</div>';
    }
    listEl.innerHTML = html;
    if (stick) listEl.scrollTop = listEl.scrollHeight;
    // Click to expand params
    var items = listEl.querySelectorAll('.rm-item');
    for (var j = 0; j < items.length; j++) {
      (function(el){ el.addEventListener('click',function(){
        var pp = el.querySelector('.rm-pp'), pf = el.querySelector('.rm-pf');
        if (pf.style.display === 'none') { pp.style.whiteSpace = 'pre-wrap'; pf.style.display = 'block'; }
        else { pp.style.whiteSpace = 'nowrap'; pf.style.display = 'none'; }
      });})(items[j]);
    }
  }
  function buildUI() {
    if (started) return;
    var nav = document.querySelector('.tab-navigation');
    var app = document.querySelector('.mcp-app');
    if (!nav || !app) { console.error('[RM] Cannot find .tab-navigation or .mcp-app'); return; }
    // Create tab button
    var btn = document.createElement('button');
    btn.className = 'tab-button';
    btn.innerHTML = '<span style=\"font-size:15px;margin-right:6px\">📡</span><span>Requests</span>';
    btn.setAttribute('data-rm-tab', '1');
    btn.addEventListener('click', function(){
      // Deactivate all tabs
      var allBtns = nav.querySelectorAll('.tab-button');
      for (var b = 0; b < allBtns.length; b++) { allBtns[b].classList.remove('active'); }
      btn.classList.add('active');
      // Hide all tab-content, show ours
      var allTC = app.querySelectorAll('.tab-content');
      for (var t = 0; t < allTC.length; t++) { allTC[t].style.display = 'none'; }
      var ourTC = document.getElementById('rmTabContent');
      if (ourTC) ourTC.style.display = '';
      poll(); render();
    });
    nav.appendChild(btn);
    // Create tab content
    var tc = document.createElement('div');
    tc.className = 'tab-content';
    tc.id = 'rmTabContent';
    tc.style.display = 'none';
    tc.style.padding = '24px 20px';
    tc.innerHTML = '<div class=\"rm-panel-inline\" style=\"display:flex;flex-direction:column;gap:14px\">'+
      '<div style=\"display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #e2e6ea;border-radius:10px;padding:12px 18px;box-shadow:0 1px 3px rgba(0,0,0,.06);gap:12px;flex-wrap:wrap\">'+
        '<div style=\"display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#1a1d23\"><span style=\"width:3px;height:16px;background:#2563eb;border-radius:2px;display:inline-block\"></span> 📡 Requests <span id=\"rmCount\" style=\"font-size:11px;color:#2563eb;background:#eff6ff;padding:2px 12px;border-radius:20px;font-weight:700\">0</span></div>'+
        '<div style=\"display:flex;align-items:center;gap:10px\">'+
          '<input type=\"text\" id=\"rmFilter\" placeholder=\"Filter by tool name...\" style=\"width:200px;padding:6px 12px;border:1px solid #e2e6ea;border-radius:6px;font-size:12px;outline:none\">'+
          '<button id=\"rmClear\" style=\"padding:4px 10px;font-size:11px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#dc2626;cursor:pointer\">Clear</button>'+
        '</div>'+
      '</div>'+
      '<div id=\"rmList\" style=\"display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto;padding:2px\">'+
        '<div style=\"text-align:center;color:#8b95a5;padding:48px 20px;font-size:14px\">No requests yet. Connect an AI client to see requests here.</div>'+
      '</div>'+
    '</div>';
    app.appendChild(tc);
    // Wire filter + clear
    var filterEl = document.getElementById('rmFilter');
    var clearBtn = document.getElementById('rmClear');
    if (filterEl) filterEl.addEventListener('input', function(){ filterText = this.value.trim(); render(); });
    if (clearBtn) clearBtn.addEventListener('click', function(){ clearAll(); });
    started = true;
    console.log('[RequestMonitor] UI built, starting poll');
    poll();
    setInterval(function(){ poll(); }, 1000);
  }
  // Wait for Vue to render, then build
  var retries = 0;
  function waitForNav() {
    if (started) return;
    if (retries++ > 150) { console.error('[RM] Timed out waiting for .tab-navigation'); return; }
    var nav = document.querySelector('.tab-navigation');
    if (!nav) { setTimeout(waitForNav, 200); return; }
    buildUI();
  }
  setTimeout(waitForNav, 100);
})();
`;

const fs = require('fs');
const fp = 'dist/panels/default/index.js';
let content = fs.readFileSync(fp, 'utf8');

// Find and replace the old injection
const oldStart = content.indexOf("// ==== Request Monitor");
const oldEnd = content.indexOf("})();\n(function", oldStart);
if (oldStart > 0 && oldEnd > 0) {
    content = content.substring(0, oldStart) + INJECTION + '\n' + content.substring(oldEnd + 5);
    fs.writeFileSync(fp, content, 'utf8');
    console.log('Injection replaced ✅');
} else {
    console.log('Old injection not found at expected position');
}
console.log('New injection size:', INJECTION.length, 'bytes');
