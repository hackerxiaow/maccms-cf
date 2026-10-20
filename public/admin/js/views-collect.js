// ========================================================
// 后台视图：采集中心 (资源站节点、分类映射、断点续采)
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};
  var curBindNode = 0;

  Views.collect = function (host) {
    host.innerHTML =
      '<div class="toolbar"><button class="btn-create" id="nodeAddBtn">+ 新增采集节点</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>节点名称</th><th>接口地址</th><th>格式</th><th>过滤源</th><th>周期(h)</th><th>上次运行</th><th>操作</th>' +
      '</tr></thead><tbody id="nodeBody"></tbody></table></div></div>' +
      '<div class="admin-card"><div class="card-head"><h3>自动化任务与采集日志</h3></div>' +
      '<div class="toolbar">' +
      '<button class="btn-create" id="runTodayBtn">⚡ 采集今日更新 (h=24)</button>' +
      '<button class="action-btn" id="runHourBtn">⏱ 采集近 1 小时</button>' +
      '<button class="action-btn" id="runAllBtn">🔄 全量深度采集 (h=0)</button>' +
      '</div><div class="log-box" id="collectLog">系统就绪：可执行单个节点或全站采集任务。</div></div>';

    App.on('nodeAddBtn', 'click', function () { openNodeModal(null); });
    App.on('runTodayBtn', 'click', function () { runAll(24); });
    App.on('runHourBtn', 'click', function () { runAll(1); });
    App.on('runAllBtn', 'click', function () { runAll(0); });
    loadNodes();
  };

  async function loadNodes() {
    var j = await App.req('/collect/nodes');
    var body = document.getElementById('nodeBody');
    if (!body) return;
    var list = j.data || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">暂无采集节点</td></tr>'; return; }
    body.innerHTML = list.map(function (n) {
      return '<tr><td>' + n.id + '</td><td><b>' + App.esc(n.name) + '</b></td>' +
        '<td class="code" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + App.esc(n.api_url) + '</td>' +
        '<td><span class="tag">' + App.esc((n.api_type || 'json').toUpperCase()) + '</span></td>' +
        '<td class="code">' + App.esc(n.filter_from) + '</td>' +
        '<td>' + (n.cron_hours === 0 ? '全量' : (n.cron_hours || 24) + 'h') + '</td>' +
        '<td>' + App.fmtTime(n.last_run_time) + '</td>' +
        '<td><button class="action-btn" data-run="' + n.id + '">即时采集</button> ' +
        '<button class="action-btn" data-bind="' + n.id + '">分类映射</button> ' +
        '<button class="action-btn" data-edit="' + n.id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + n.id + '">删除</button></td></tr>';
    }).join('');

    document.querySelectorAll('#nodeBody [data-run]').forEach(function (b) {
      b.onclick = function () { runSingle(parseInt(b.dataset.run, 10), 24); };
    });
    document.querySelectorAll('#nodeBody [data-bind]').forEach(function (b) {
      b.onclick = function () { openBindModal(parseInt(b.dataset.bind, 10)); };
    });
    document.querySelectorAll('#nodeBody [data-edit]').forEach(function (b) {
      b.onclick = function () {
        var n = list.find(function (x) { return x.id === parseInt(b.dataset.edit, 10); });
        openNodeModal(n);
      };
    });
    document.querySelectorAll('#nodeBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该采集节点及其分类映射？')) return;
        await App.req('/collect/node/' + b.dataset.del, { method: 'DELETE' });
        App.toast('节点已删除');
        loadNodes();
      };
    });
  }

  function openNodeModal(n) {
    n = n || {};
    var body =
      '<div class="row2">' +
      App.field('节点名称 *', App.input('nName', n.name)) +
      App.field('接口地址 *', App.input('nUrl', n.api_url, 'https://example.com/api.php/provide/vod/')) +
      '</div>' +
      '<div class="row3">' +
      App.field('接口格式', App.select('nType', [{ value: 'json', label: 'JSON (v8/v10)' }, { value: 'xml', label: 'XML (RSS 5.1/2.0)' }], n.api_type || 'json')) +
      App.field('采集周期 (小时, 0=全量)', App.input('nHours', n.cron_hours !== undefined ? n.cron_hours : 24, '', 'number')) +
      App.field('状态', App.select('nStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], n.status === 0 ? 0 : 1)) +
      '</div>' +
      App.field('播放源过滤 / 重命名 (如 dplayer)', App.input('nFilterFrom', n.filter_from)) +
      App.field('广告词过滤 (英文逗号分隔)', App.input('nFilterWord', n.filter_word, '澳门,赌场,加微信'));

    App.modal(n.id ? '编辑采集节点 #' + n.id : '新增采集节点', body, async function () {
      var payload = {
        id: n.id || undefined,
        name: App.val('nName'), api_url: App.val('nUrl'), api_type: App.val('nType'),
        cron_hours: App.intVal('nHours'), status: App.intVal('nStatus'),
        filter_from: App.val('nFilterFrom'), filter_word: App.val('nFilterWord')
      };
      if (!payload.name || !payload.api_url) { App.toast('请填写节点名称与接口地址', true); return; }
      var r = await App.req('/collect/node/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('采集节点已保存'); loadNodes(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  async function openBindModal(nodeId) {
    curBindNode = nodeId;
    App.modal('分类映射绑定 (节点 #' + nodeId + ')',
      '<div id="bindWrap"><div class="empty">正在拉取远端分类字典…</div></div>',
      saveBinds, '保存映射');
    try {
      var results = await Promise.all([
        App.req('/collect/node/' + nodeId + '/remote-classes'),
        App.req('/collect/node/' + nodeId + '/binds')
      ]);
      var wrap = document.getElementById('bindWrap');
      if (!wrap) return;
      var rj = results[0];
      var bj = results[1];
      if (rj.code !== 0) { wrap.innerHTML = '<div class="empty">获取失败: ' + App.esc(rj.msg) + '</div>'; return; }
      var bindMap = {};
      (bj.data || []).forEach(function (b) { bindMap[b.source_type_id] = b.local_type_id; });
      var rows = (rj.data || []).map(function (remote) {
        var opts = '<option value="0">-- 忽略跳过 --</option>' + App.types.map(function (t) {
          return '<option value="' + t.type_id + '"' + (bindMap[remote.type_id] === t.type_id ? ' selected' : '') + '>' +
            (t.type_pid > 0 ? '└ ' : '') + App.esc(t.type_name) + '</option>';
        }).join('');
        return '<tr><td><b>' + App.esc(remote.type_name) + '</b> <span class="muted">(远端ID ' + remote.type_id + ')</span></td>' +
          '<td><select class="admin-select bind-select" data-sid="' + remote.type_id + '" data-sname="' + App.esc(remote.type_name) + '">' + opts + '</select></td></tr>';
      }).join('');
      wrap.innerHTML = '<div class="help-block" style="margin-bottom:.6rem">未映射的远端分类在采集时会自动跳过。支持随时重新调整。</div>' +
        '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>远端分类</th><th>映射到本地分类</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="2" class="empty">远端未返回分类</td></tr>') + '</tbody></table></div>';
    } catch (e) {
      var w = document.getElementById('bindWrap');
      if (w) w.innerHTML = '<div class="empty">异常: ' + App.esc(e.message) + '</div>';
    }
  }

  async function saveBinds() {
    var selects = document.querySelectorAll('.bind-select');
    var binds = [];
    selects.forEach(function (s) {
      var localId = parseInt(s.value, 10);
      if (localId > 0) {
        binds.push({ source_type_id: parseInt(s.dataset.sid, 10), source_type_name: s.dataset.sname, local_type_id: localId });
      }
    });
    var r = await App.req('/collect/node/' + curBindNode + '/binds', { method: 'POST', body: { binds: binds } });
    if (r.code === 0) { App.closeModal(); App.toast(r.msg || '映射已保存'); }
    else App.toast(r.msg || '保存失败', true);
  }

  async function runSingle(nodeId, hours) {
    var log = document.getElementById('collectLog');
    log.textContent = '[' + new Date().toLocaleTimeString() + '] 正在执行节点 #' + nodeId + ' 采集 (h=' + hours + ')…';
    var r = await App.req('/collect/run', { method: 'POST', body: { node_id: nodeId, hours: hours } });
    log.textContent = '[' + new Date().toLocaleTimeString() + '] 节点 #' + nodeId + ' 执行结果：\n' + JSON.stringify(r, null, 2);
    loadNodes();
  }

  async function runAll(hours) {
    var log = document.getElementById('collectLog');
    log.textContent = '[' + new Date().toLocaleTimeString() + '] 正在广播全站采集任务…';
    var nodes = await App.req('/collect/nodes');
    var list = nodes.data || [];
    var lines = [];
    for (var i = 0; i < list.length; i++) {
      var r = await App.req('/collect/run', { method: 'POST', body: { node_id: list[i].id, hours: hours } });
      lines.push('• ' + list[i].name + ' → ' + (r.code === 0 ? (r.data.messages || []).join('；') : ('失败: ' + r.msg)));
      log.textContent = '[' + new Date().toLocaleTimeString() + '] 全站采集进度：\n' + lines.join('\n');
    }
    log.textContent += '\n\n✅ 全部任务执行完毕';
    loadNodes();
  }
})(window);