(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};
  var page = 1;

  Views.website = function (host) {
    page = 1;
    host.innerHTML =
      '<div class="toolbar">' +
      '<input class="input-box" id="websiteKw" placeholder="搜索网站名称或网址" style="max-width:280px">' +
      '<button class="action-btn" id="websiteSearch">搜索</button>' +
      '<button class="btn-create" id="websiteAdd">+ 新增网址</button>' +
      '</div><div id="websitePane"></div>';
    document.getElementById('websiteSearch').onclick = function () { page = 1; render(); };
    document.getElementById('websiteKw').onkeydown = function (e) { if (e.key === 'Enter') { page = 1; render(); } };
    document.getElementById('websiteAdd').onclick = function () { openModal(null); };
    render();
  };

  async function render() {
    var pane = document.getElementById('websitePane');
    if (!pane) return;
    pane.innerHTML = '<div class="empty">正在载入网址…</div>';
    var params = new URLSearchParams({ page: String(page), limit: '20' });
    var wd = App.val('websiteKw');
    if (wd) params.set('wd', wd);
    var response = await App.req('/website/list?' + params.toString());
    if (response.code !== 0) {
      pane.innerHTML = '<div class="empty">' + App.esc(response.msg || '网址列表加载失败') + '</div>';
      return;
    }

    var data = response.data || { list: [] };
    var rows = data.list || [];
    var html = '<div class="admin-card"><div class="toolbar"><span class="muted">批量操作：</span><button class="action-btn" data-batch="show">批量显示</button><button class="action-btn" data-batch="hide">批量隐藏</button><button class="action-btn del" data-batch="delete">批量删除</button></div>' +
      '<div style="overflow-x:auto"><table class="data-table">' +
      '<thead><tr><th><input type="checkbox" class="checkbox" id="websiteSelectAll"></th><th>ID</th><th>名称</th><th>分类</th><th>网址</th><th>推荐</th><th>访问</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    if (!rows.length) html += '<tr><td colspan="9" class="empty">暂无网址，点击“新增网址”创建第一个条目。</td></tr>';
    rows.forEach(function (item) {
      html += '<tr><td><input type="checkbox" class="checkbox website-check" value="' + item.website_id + '"></td><td>' + item.website_id + '</td>' +
        '<td><b>' + App.esc(item.website_name) + '</b><br><span class="muted">' + App.esc(item.website_sub || '') + '</span></td>' +
        '<td>' + App.esc(item.type_name || '未分类') + '</td>' +
        '<td class="code" style="min-width:220px;max-width:360px;overflow-wrap:anywhere">' + App.esc(item.website_url) + '</td>' +
        '<td>' + (item.website_level ? '<span class="tag gold">推荐 ' + item.website_level + '</span>' : '—') + '</td>' +
        '<td>' + (item.website_referer || 0) + '</td>' +
        '<td>' + (item.website_status ? '<span class="tag green">显示</span>' : '<span class="tag red">隐藏</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + item.website_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + item.website_id + '">删除</button></td></tr>';
    });
    html += '</tbody></table></div>' + App.pager(data, function (next) { page = next; render(); }) + '</div>';
    pane.innerHTML = html;
    var selectAll = document.getElementById('websiteSelectAll');
    if (selectAll) selectAll.onchange = function () { pane.querySelectorAll('.website-check').forEach(function (box) { box.checked = selectAll.checked; }); };
    pane.querySelectorAll('[data-batch]').forEach(function (button) {
      button.onclick = async function () {
        var ids = Array.from(pane.querySelectorAll('.website-check:checked')).map(function (box) { return Number(box.value); });
        if (!ids.length) { App.toast('请先选择网址条目', true); return; }
        var action = button.dataset.batch;
        if (action === 'delete' && !confirm('确定删除所选的 ' + ids.length + ' 个网址条目？')) return;
        var result = await App.req(action === 'delete' ? '/website/batch/delete' : '/website/batch/status', {
          method: 'POST', body: { ids: ids, status: action === 'show' ? 1 : 0 }
        });
        if (result.code === 0) { App.toast(result.msg); render(); }
        else App.toast(result.msg || '批量操作失败', true);
      };
    });
    pane.querySelectorAll('[data-edit]').forEach(function (button) {
      button.onclick = function () { openModal(rows.find(function (item) { return item.website_id === Number(button.dataset.edit); })); };
    });
    pane.querySelectorAll('[data-del]').forEach(function (button) {
      button.onclick = async function () {
        if (!confirm('确定删除这个网址条目？')) return;
        var result = await App.req('/website/' + button.dataset.del, { method: 'DELETE' });
        if (result.code === 0) { App.toast('网址已删除'); render(); }
        else App.toast(result.msg || '删除失败', true);
      };
    });
  }

  function openModal(item) {
    item = item || {};
    var categories = App.types.filter(function (type) { return Number(type.type_mid) === 11; })
      .map(function (type) { return { value: type.type_id, label: type.type_name }; });
    var body = '<div class="row2">' +
      App.field('网站名称 *', App.input('wsName', item.website_name)) +
      App.field('副标题', App.input('wsSub', item.website_sub)) + '</div>' +
      '<div class="row2">' +
      App.field('网址分类', App.select('wsType', categories, item.type_id || '', '未分类')) +
      App.field('网站地址 *', App.input('wsUrl', item.website_url, 'https://example.com')) + '</div>' +
      App.field('跳转地址（留空则使用网站地址）', App.input('wsJump', item.website_jumpurl, 'https://example.com')) +
      '<div class="row2">' +
      App.field('封面图片 URL', App.input('wsPic', item.website_pic)) +
      App.field('Logo 图片 URL', App.input('wsLogo', item.website_logo)) + '</div>' +
      '<div class="row3">' +
      App.field('排序', App.input('wsSort', item.website_sort || 0, '', 'number')) +
      App.field('推荐级别（0–9）', App.input('wsLevel', item.website_level || 0, '', 'number')) +
      App.field('状态', App.select('wsStatus', [{ value: 1, label: '显示' }, { value: 0, label: '隐藏' }], item.website_status === 0 ? 0 : 1)) +
      '</div>';

    App.modal(item.website_id ? '编辑网址 #' + item.website_id : '新增网址', body, async function () {
      var payload = {
        website_id: item.website_id || undefined,
        type_id: App.intVal('wsType'),
        website_name: App.val('wsName'),
        website_sub: App.val('wsSub'),
        website_url: App.val('wsUrl'),
        website_jumpurl: App.val('wsJump'),
        website_pic: App.val('wsPic'),
        website_logo: App.val('wsLogo'),
        website_sort: App.intVal('wsSort'),
        website_level: Math.min(9, Math.max(0, App.intVal('wsLevel'))),
        website_status: App.intVal('wsStatus'),
      };
      if (!payload.website_name || !payload.website_url) { App.toast('请填写网站名称与地址', true); return; }
      var result = await App.req('/website/save', { method: 'POST', body: payload });
      if (result.code === 0) { App.closeModal(); App.toast('网址已保存'); render(); }
      else App.toast(result.msg || '保存失败', true);
    });
  }
})(window);
