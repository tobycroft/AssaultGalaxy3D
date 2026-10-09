/**
 * Rebuild dist/panels/default/index.js from scratch:
 * 1. Extract the original obfuscated IIFE
 * 2. Prepend a single clean injection (task list, natural language labels)
 */
const fs = require('fs');

const INJECTION = `'use strict';
// ==== Task List (server tab, v-if serverRunning, always-poll) ====
(function () {
  var allEntries = [];

  // ---- Shadow-root-aware queries ----
  function byIdShadow(id) {
    try { var e = document.getElementById(id); if (e) return e; } catch (e1) {}
    try {
      var all = document.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) {
        if (all[j].shadowRoot) {
          var f = all[j].shadowRoot.getElementById(id);
          if (f) return f;
        }
      }
    } catch (e2) {}
    return null;
  }

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

  var ACTION_LABELS = {
    create: '创建', create_node: '创建一个节点', create_scene: '创建一个场景', create_prefab: '创建一个预制体',
    open: '打开', save: '保存', close: '关闭', delete: '删除', remove: '移除',
    add: '添加', set: '设置', get: '获取', list: '列出', find: '查找',
    hierarchy: '获取层级', get_info: '获取信息', add_component: '添加组件',
    remove_component: '移除组件', set_property: '设置属性',
    set_component_property: '设置组件属性', get_node_info: '获取节点信息',
    get_all_nodes: '获取所有节点', get_scene_info: '获取场景信息',
    get_scene_hierarchy: '获取场景层级', create_new_scene: '创建一个新场景',
    find_node: '查找节点', capture: '截图', build: '构建', preview: '预览',
    execute: '执行', run: '运行', validate_scene: '校验场景', list_components: '列出组件',
    batch_rename: '批量重命名', spawn_prefab: '生成预制体实例', instantiate: '实例化'
  };

  function taskLabel(r) {
    if (r.method !== 'tools/call') return r.method || '请求';
    var act = (r.params && r.params.action) ? (ACTION_LABELS[r.params.action] || r.params.action) : '';
    var name = (r.params && r.params.name) ? r.params.name : '';
    if (act && name) return act + '叫做 ' + name;
    if (act) return act;
    return '调用工具 ' + (r.toolName || '');
  }

  function poll() {
    if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
      Editor.Message.request('cocos-mcp', 'get-request-history', 200)
        .then(function (data) {
          allEntries = Array.isArray(data) ? data : [];
          render();
        })
        .catch(function (e) { console.error('[TaskList] poll failed:', (e && e.message) || e); });
    }
  }

  function render() {
    var listEl = byIdShadow('rmList');
    var countEl = byIdShadow('rmCount');
    // Section hidden when server not running — skip silently
    if (!listEl || !countEl) return;
    countEl.textContent = allEntries.length;
    if (allEntries.length === 0) {
      listEl.innerHTML = '<div class="rm-empty">暂无任务。向 AI 发送操控 Cocos 的指令后，任务将在此显示。</div>';
      return;
    }
    var stick = (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight) < 40;
    var html = '';
    for (var i = allEntries.length - 1; i >= 0; i--) {
      var r = allEntries[i];
      var sc = r.status === 'error' ? 'error' : (r.status === 'pending' ? 'pending' : 'success');
      var dc = r.duration > 2000 ? 'very-slow' : (r.duration > 500 ? 'slow' : '');
      var label = taskLabel(r);
      html += '<div class="rm-item" data-id="'+r.id+'">'+
        '<div class="rm-status '+sc+'"></div>'+
        '<div class="rm-item-body">'+
          '<div class="rm-item-row">'+
            '<span class="rm-time">'+esc(fmtTime(r.timestamp))+'</span>'+
            '<span class="rm-task-label" title="'+esc(label)+'">'+esc(label)+'</span>'+
            '<span class="rm-method-badge" title="'+esc(r.toolName)+'">'+esc(r.toolName)+'</span>'+
            '<span class="rm-duration '+dc+'">'+r.duration+'ms</span>'+
          '</div>'+
          '<div class="rm-params-preview">'+esc(summarize(r.params))+'</div>'+
          '<div class="rm-params-full">'+(r.params ? esc(JSON.stringify(r.params, null, 2)) : '')+'</div>'+
          (r.error ? '<div class="rm-error">'+esc(r.error)+'</div>' : '')+
        '</div>'+
      '</div>';
    }
    listEl.innerHTML = html;
    if (stick) listEl.scrollTop = listEl.scrollHeight;
    var items = listEl.querySelectorAll('.rm-item');
    for (var j = 0; j < items.length; j++) {
      (function (el) { el.addEventListener('click', function () { el.classList.toggle('expanded'); }); })(items[j]);
    }
  }

  // Always poll — render() skips when section not in DOM (server stopped)
  poll();
  setInterval(function () { poll(); }, 1000);
})();
`;

// ---- Rebuild file ----
const fp = 'dist/panels/default/index.js';
const current = fs.readFileSync(fp, 'utf8');

// Extract the original obfuscated IIFE (from '(function(_0x52edbc' to end)
const iifeStart = current.indexOf('(function(_0x52edbc');
if (iifeStart < 0) {
    console.error('❌ Obfuscated IIFE not found — aborting rebuild');
    process.exit(1);
}
const obfuscated = current.substring(iifeStart);

// New file = clean injection + original IIFE
const rebuilt = INJECTION + '\n' + obfuscated;

fs.writeFileSync(fp, rebuilt, 'utf8');
console.log('✅ Panel rebuilt: injection (' + INJECTION.length + ' bytes) + obfuscated (' + obfuscated.length + ' bytes)');

// ---- Syntax verification ----
try {
    new Function(rebuilt.replace(/require\s*\(/g, '__require('));
    console.log('✅ Injection+IIFE syntax valid (with require stubbed)');
} catch (e) {
    console.log('❌ Syntax error:', e.message);
}
