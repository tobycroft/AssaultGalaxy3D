/**
 * Build final simplified injection:
 * - Always polls every 1s (no one-shot wait — list appears/disappears with serverRunning)
 * - No filter UI, just task list + count
 * - Shadow-root-aware queries
 */
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
    create:'创建', create_node:'创建节点', create_scene:'创建场景', create_prefab:'创建预制体',
    open:'打开', save:'保存', close:'关闭', delete:'删除', remove:'移除',
    add:'添加', set:'设置', get:'获取', list:'列出', find:'查找',
    hierarchy:'获取层级', get_info:'获取信息', add_component:'添加组件',
    remove_component:'移除组件', set_property:'设置属性',
    set_component_property:'设置组件属性', get_node_info:'获取节点信息',
    get_all_nodes:'获取所有节点', get_scene_info:'获取场景信息',
    get_scene_hierarchy:'获取场景层级', create_new_scene:'创建新场景',
    find_node:'查找节点', capture:'截图', build:'构建', preview:'预览',
    execute:'执行', run:'运行', validate_scene:'校验场景', list_components:'列出组件'
  };
  function taskLabel(r) {
    if (r.method === 'initialize') return 'AI 客户端连接初始化';
    if (r.method === 'tools/list') return '获取工具列表';
    if (r.method && r.method.indexOf('notifications/') === 0) return '通知: ' + r.method.replace('notifications/','');
    if (r.method === 'tools/call' && r.params && r.params.action) {
      var act = ACTION_LABELS[r.params.action] || r.params.action;
      var name = r.params.name || '';
      return name ? act + ' ' + name : act;
    }
    if (r.method === 'tools/call') return '调用工具 ' + (r.toolName || '');
    return r.method || '请求';
  }
  function poll() {
    if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
      Editor.Message.request('cocos-mcp', 'get-request-history', 200)
        .then(function (data) { allEntries = Array.isArray(data) ? data : []; render(); })
        .catch(function (e) { console.error('[TaskList] poll failed:', (e&&e.message)||e); });
    }
  }
  function render() {
    var listEl = byIdShadow('rmList');
    var countEl = byIdShadow('rmCount');
    // Section hidden when server not running — just skip
    if (!listEl || !countEl) return;
    countEl.textContent = allEntries.length;
    if (allEntries.length === 0) {
      listEl.innerHTML = '<div class=\"rm-empty\">暂无任务。向 AI 发送操控 Cocos 的指令后，任务将在此显示。</div>';
      return;
    }
    var stick = (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight) < 40;
    var html = '';
    for (var i = allEntries.length - 1; i >= 0; i--) {
      var r = allEntries[i];
      var sc = r.status === 'error' ? 'error' : (r.status === 'pending' ? 'pending' : 'success');
      var dc = r.duration > 2000 ? 'very-slow' : (r.duration > 500 ? 'slow' : '');
      var label = taskLabel(r);
      html += '<div class=\"rm-item\" data-id=\"'+r.id+'\">'+
        '<div class=\"rm-status '+sc+'\"></div>'+
        '<div class=\"rm-item-body\">'+
          '<div class=\"rm-item-row\">'+
            '<span class=\"rm-time\">'+esc(fmtTime(r.timestamp))+'</span>'+
            '<span class=\"rm-task-label\" title=\"'+esc(label)+'\">'+esc(label)+'</span>'+
            '<span class=\"rm-method-badge\" title=\"'+esc(r.toolName)+'\">'+esc(r.toolName)+'</span>'+
            '<span class=\"rm-duration '+dc+'\">'+r.duration+'ms</span>'+
          '</div>'+
          '<div class=\"rm-params-preview\">'+esc(summarize(r.params))+'</div>'+
          '<div class=\"rm-params-full\">'+(r.params?esc(JSON.stringify(r.params,null,2)):'')+'</div>'+
          (r.error?'<div class=\"rm-error\">'+esc(r.error)+'</div>':'')+
        '</div>'+
      '</div>';
    }
    listEl.innerHTML = html;
    if (stick) listEl.scrollTop = listEl.scrollHeight;
    var items = listEl.querySelectorAll('.rm-item');
    for (var j = 0; j < items.length; j++) {
      (function(el){ el.addEventListener('click', function(){ el.classList.toggle('expanded'); });})(items[j]);
    }
  }
  // Always poll — render() skips when section not in DOM (server stopped)
  poll();
  setInterval(function(){ poll(); }, 1000);
})();
`;

const fs = require('fs');
const fp = 'dist/panels/default/index.js';
let content = fs.readFileSync(fp, 'utf8');

// Remove old injection if present
const oldStart = content.indexOf('// ==== Task List');
const oldEnd = content.indexOf('(function(_0x52edbc');
if (oldStart > 0 && oldEnd > 0 && oldStart < oldEnd) {
    content = content.substring(0, oldStart) + content.substring(oldEnd);
}

// Insert new injection after 'use strict';
const anchor = "'use strict';";
const idx = content.indexOf(anchor);
content = content.substring(0, idx + anchor.length) + '\n' + INJECTION + '\n' + content.substring(idx + anchor.length);
fs.writeFileSync(fp, content, 'utf8');
console.log('Injection applied ✅ (' + INJECTION.length + ' bytes)');
