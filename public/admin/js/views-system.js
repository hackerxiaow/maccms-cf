// ========================================================
// 后台视图：播放下载 / 广告友链 / 海螺主题 / 系统设置
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  // ---------------- 播放器 / 下载器 / 服务器 ----------------
  Views.player = function (host) {
    host.innerHTML =
      '<div class="tabs-line" id="pdtabs"><a class="active" data-tab="player">播放器引擎</a><a data-tab="downer">下载器</a><a data-tab="server">流媒体服务器</a></div>' +
      '<div id="pdpane"></div>';
    document.querySelectorAll('#pdtabs a').forEach(function (a) {
      a.onclick = function () {
        document.querySelectorAll('#pdtabs a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        renderPd(a.dataset.tab);
      };
    });
    renderPd('player');
  };

  async function renderPd(kind) {
    var pane = document.getElementById('pdpane');
    var titles = { player: '播放器引擎', downer: '下载器', server: '流媒体服务器组' };
    var labels = {
      player: ['编码', '名称', '主解析接口', '备用解析接口', '沙箱方式', '状态', '排序'],
      downer: ['编码', '名称', '', '', '', '状态', '排序'],
      server: ['编码', '名称', '', '', '', '状态', '排序']
    };
    var j = await App.req('/' + kind + '/list');
    var list = j.data || [];
    var html = '<div class="toolbar"><button class="btn-create" data-add="1">+ 新增' + titles[kind] + '</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>编码</th><th>名称</th><th>解析 / 提示</th><th>状态</th><th>排序</th><th>操作</th>' +
      '</tr></thead><tbody>';
    if (!list.length) html += '<tr><td colspan="7" class="empty">暂无配置</td></tr>';
    list.forEach(function (p) {
      var extra = kind === 'player'
        ? '<span class="code">' + App.esc(p.parse_url || '原生直连') + '</span>' + (p.player_parse2 ? '<br><span class="muted">备用：' + App.esc(p.player_parse2) + '</span>' : '')
        : App.esc(p.tip || '');
      html += '<tr><td>' + p.id + '</td><td class="code">' + App.esc(p.code) + '</td><td><b>' + App.esc(p.name) + '</b></td>' +
        '<td>' + extra + '</td><td>' + (p.status ? '<span class="tag green">启用</span>' : '<span class="tag red">停用</span>') + '</td>' +
        '<td>' + p.sort + '</td>' +
        '<td><button class="action-btn" data-edit="' + p.id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + p.id + '">删除</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
    pane.innerHTML = html;

    pane.querySelector('[data-add]').onclick = function () { openPdModal(kind, null); };
    pane.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var item = list.find(function (x) { return x.id === parseInt(b.dataset.edit, 10); });
        openPdModal(kind, item);
      };
    });
    pane.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除？')) return;
        await App.req('/' + kind + '/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        renderPd(kind);
      };
    });
  }

  function openPdModal(kind, p) {
    p = p || {};
    var body = '<div class="row3">' +
      App.field('编码 (code) *', App.input('pdCode', p.code)) +
      App.field('显示名称 *', App.input('pdName', p.name)) +
      App.field('排序', App.input('pdSort', p.sort || 0, '', 'number')) +
      '</div>' +
      App.field('状态', App.select('pdStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], p.status === 0 ? 0 : 1));
    if (kind === 'player') {
      body += '<div class="row2">' +
        App.field('主解析接口', App.input('pdParse', p.parse_url, 'https://jx.example.com/?url=')) +
        App.field('备用第二解析接口', App.input('pdParse2', p.player_parse2, '主解析失败时自动回退')) +
        '</div>' +
        App.field('沙箱方式', App.select('pdTarget', [{ value: '_self', label: '页面内嵌' }, { value: 'iframe', label: 'iframe 沙箱' }, { value: '_blank', label: '新窗口打开' }], p.player_target || '_self')) +
        App.field('播放内核代码模板', App.textarea('pdContent', p.player_content, 3)) +
        App.field('使用提示', App.input('pdTip', p.tip));
    } else {
      body += App.field('使用提示', App.input('pdTip', p.tip));
    }
    App.modal(p.id ? '编辑' + (kind === 'player' ? '播放器' : kind === 'downer' ? '下载器' : '服务器') + ' #' + p.id : '新增配置', body, async function () {
      var payload = {
        id: p.id || undefined, code: App.val('pdCode'), name: App.val('pdName'),
        sort: App.intVal('pdSort'), status: App.intVal('pdStatus')
      };
      if (kind === 'player') {
        payload.parse_url = App.val('pdParse');
        payload.player_parse2 = App.val('pdParse2');
        payload.player_target = App.val('pdTarget');
        payload.player_content = App.val('pdContent');
        payload.tip = App.val('pdTip');
      } else {
        payload.tip = App.val('pdTip');
      }
      if (!payload.code || !payload.name) { App.toast('请填写编码与名称', true); return; }
      var r = await App.req('/' + kind + '/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('保存成功'); renderPd(kind); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  // ---------------- 广告位与友情链接 ----------------
  Views.ads = function (host) {
    host.innerHTML =
      '<div class="tabs-line" id="adsTabs"><a class="active" data-tab="ads">广告位管理</a><a data-tab="link">友情链接</a></div><div id="adsPane"></div>';
    document.querySelectorAll('#adsTabs a').forEach(function (a) {
      a.onclick = function () {
        document.querySelectorAll('#adsTabs a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        if (a.dataset.tab === 'ads') renderAds();
        else renderLinks();
      };
    });
    renderAds();
  };

  async function renderAds() {
    var j = await App.req('/ads/list');
    var pane = document.getElementById('adsPane');
    var list = j.data || [];
    var html = '<div class="toolbar"><button class="btn-create" id="adsAdd">+ 新增广告位</button></div>' +
      '<div class="admin-card"><table class="data-table"><thead><tr><th>ID</th><th>标识</th><th>名称</th><th>代码预览</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    if (!list.length) html += '<tr><td colspan="6" class="empty">暂无广告位</td></tr>';
    list.forEach(function (a) {
      html += '<tr><td>' + a.ads_id + '</td><td class="code">' + App.esc(a.ads_key) + '</td><td><b>' + App.esc(a.ads_name) + '</b></td>' +
        '<td class="muted" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + App.esc(a.ads_content) + '</td>' +
        '<td>' + (a.ads_status ? '<span class="tag green">投放中</span>' : '<span class="tag red">停用</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + a.ads_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + a.ads_id + '">删除</button></td></tr>';
    });
    html += '</tbody></table></div>';
    pane.innerHTML = html;
    pane.querySelector('#adsAdd').onclick = function () { openAdModal(null); };
    pane.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { openAdModal(list.find(function (x) { return x.ads_id === parseInt(b.dataset.edit, 10); })); };
    });
    pane.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该广告位？')) return;
        await App.req('/ads/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        renderAds();
      };
    });
  }

  function openAdModal(a) {
    a = a || {};
    var body = '<div class="row2">' +
      App.field('广告位标识 *', App.input('adKey', a.ads_key, 'home_top / player_pause / float_right')) +
      App.field('广告名称 *', App.input('adName', a.ads_name)) +
      '</div>' +
      App.field('状态', App.select('adStatus', [{ value: 1, label: '投放中' }, { value: 0, label: '停用' }], a.ads_status === 0 ? 0 : 1)) +
      App.field('广告 HTML / 脚本代码', App.textarea('adContent', a.ads_content, 6)) +
      App.field('排序', App.input('adSort', a.ads_sort || 0, '', 'number'));
    App.modal(a.ads_id ? '编辑广告位 #' + a.ads_id : '新增广告位', body, async function () {
      var payload = {
        ads_id: a.ads_id || undefined, ads_key: App.val('adKey'), ads_name: App.val('adName'),
        ads_status: App.intVal('adStatus'), ads_content: App.val('adContent'), ads_sort: App.intVal('adSort')
      };
      if (!payload.ads_key || !payload.ads_name) { App.toast('请填写标识与名称', true); return; }
      var r = await App.req('/ads/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('广告位已保存'); renderAds(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  async function renderLinks() {
    var j = await App.req('/link/list');
    var pane = document.getElementById('adsPane');
    var list = j.data || [];
    var html = '<div class="toolbar"><button class="btn-create" id="linkAdd">+ 新增友情链接</button></div>' +
      '<div class="admin-card"><table class="data-table"><thead><tr><th>ID</th><th>名称</th><th>链接</th><th>排序</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    if (!list.length) html += '<tr><td colspan="6" class="empty">暂无友链</td></tr>';
    list.forEach(function (l) {
      html += '<tr><td>' + l.link_id + '</td><td><b>' + App.esc(l.link_name) + '</b></td>' +
        '<td><a href="' + App.esc(l.link_url) + '" target="_blank" style="color:#38bdf8">' + App.esc(l.link_url) + '</a></td>' +
        '<td>' + l.link_sort + '</td><td>' + (l.link_status ? '<span class="tag green">显示</span>' : '<span class="tag red">隐藏</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + l.link_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + l.link_id + '">删除</button></td></tr>';
    });
    html += '</tbody></table></div>';
    pane.innerHTML = html;
    pane.querySelector('#linkAdd').onclick = function () { openLinkModal(null); };
    pane.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { openLinkModal(list.find(function (x) { return x.link_id === parseInt(b.dataset.edit, 10); })); };
    });
    pane.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该友链？')) return;
        await App.req('/link/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        renderLinks();
      };
    });
  }

  function openLinkModal(l) {
    l = l || {};
    var body = '<div class="row2">' +
      App.field('站点名称 *', App.input('lkName', l.link_name)) +
      App.field('跳转链接 *', App.input('lkUrl', l.link_url)) +
      '</div><div class="row3">' +
      App.field('Logo 图片', App.input('lkLogo', l.link_logo)) +
      App.field('排序', App.input('lkSort', l.link_sort || 0, '', 'number')) +
      App.field('状态', App.select('lkStatus', [{ value: 1, label: '显示' }, { value: 0, label: '隐藏' }], l.link_status === 0 ? 0 : 1)) +
      '</div>';
    App.modal(l.link_id ? '编辑友链 #' + l.link_id : '新增友情链接', body, async function () {
      var payload = {
        link_id: l.link_id || undefined, link_name: App.val('lkName'), link_url: App.val('lkUrl'),
        link_logo: App.val('lkLogo'), link_sort: App.intVal('lkSort'), link_status: App.intVal('lkStatus')
      };
      if (!payload.link_name || !payload.link_url) { App.toast('请填写名称与链接', true); return; }
      var r = await App.req('/link/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('友链已保存'); renderLinks(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  // ---------------- 海螺主题配置 ----------------
  var themeData = null;
  var themeGroup = 'general';
  var themeDraft = {};

  Views.theme = async function (host) {
    host.innerHTML = '<div class="admin-card"><div class="card-head"><h3>海螺 Conch_M003 主题全量配置</h3>' +
      '<div class="toolbar" style="margin:0">' +
      '<button class="action-btn" onclick="window.open(\'/\',\'_blank\')">预览前台</button>' +
      '<button class="action-btn" id="themeResetBtn">重置本组</button>' +
      '<button class="btn-create" id="themeSaveBtn">保存配置</button></div></div>' +
      '<div id="themeTabs"></div><div id="themeForm"><div class="empty">加载中…</div></div></div>';
    App.on('themeSaveBtn', 'click', saveTheme);
    App.on('themeResetBtn', 'click', resetThemeGroup);
    var j = await App.req('/theme');
    if (j.code !== 0) { document.getElementById('themeForm').innerHTML = '<div class="empty">加载失败</div>'; return; }
    themeData = j.data;
    themeDraft = {};
    themeData.items.forEach(function (it) { themeDraft[it.key] = it.value; });
    renderThemeTabs();
    renderThemeForm();
  };

  function renderThemeTabs() {
    var tabs = document.getElementById('themeTabs');
    tabs.innerHTML = themeData.groups.map(function (g) {
      return '<span class="theme-tab' + (g.key === themeGroup ? ' active' : '') + '" data-g="' + g.key + '">' + g.icon + ' ' + App.esc(g.title) + '</span>';
    }).join('');
    tabs.querySelectorAll('[data-g]').forEach(function (el) {
      el.onclick = function () { themeGroup = el.dataset.g; renderThemeTabs(); renderThemeForm(); };
    });
  }

  function renderThemeForm() {
    var wrap = document.getElementById('themeForm');
    var items = themeData.items.filter(function (it) { return it.group === themeGroup; });
    if (!items.length) { wrap.innerHTML = '<div class="empty">该分组暂无配置项</div>'; return; }
    wrap.innerHTML = '<div class="theme-grid">' + items.map(function (it) {
      var v = themeDraft[it.key] !== undefined ? themeDraft[it.key] : it.value;
      var inner;
      if (it.type === 'switch') {
        inner = '<select class="admin-select" data-k="' + it.key + '"><option value="0"' + (v === '0' ? ' selected' : '') + '>关闭</option><option value="1"' + (v === '1' ? ' selected' : '') + '>开启</option></select>';
      } else if (it.type === 'textarea') {
        inner = '<textarea class="input-box" rows="3" data-k="' + it.key + '">' + App.esc(v) + '</textarea>';
      } else if (it.type === 'number') {
        inner = '<input class="input-box" type="number" data-k="' + it.key + '" value="' + App.esc(v) + '">';
      } else if (it.type === 'color') {
        inner = '<div style="display:flex;gap:.4rem"><input type="color" data-k="' + it.key + '" value="' + App.esc(v || '#0099ff') + '" style="width:44px;height:34px;border:none;background:none"><input class="input-box" data-k2="' + it.key + '" value="' + App.esc(v) + '"></div>';
      } else {
        inner = '<input class="input-box" data-k="' + it.key + '" value="' + App.esc(v) + '">';
      }
      return '<div class="form-group" style="margin-bottom:0"><label class="form-label" title="' + App.esc(it.key) + '">' + App.esc(it.title) + '</label>' + inner +
        '<div class="muted" style="font-family:monospace;font-size:.68rem;margin-top:2px">' + App.esc(it.key) + '</div></div>';
    }).join('') + '</div>';

    wrap.querySelectorAll('[data-k]').forEach(function (el) {
      el.addEventListener('input', function () { themeDraft[el.dataset.k] = el.value; });
      el.addEventListener('change', function () { themeDraft[el.dataset.k] = el.value; });
    });
    wrap.querySelectorAll('[data-k2]').forEach(function (el) {
      el.addEventListener('input', function () {
        themeDraft[el.dataset.k2] = el.value;
        var color = wrap.querySelector('[data-k="' + el.dataset.k2 + '"]');
        if (color) color.value = el.value;
      });
    });
    wrap.querySelectorAll('input[type=color][data-k]').forEach(function (el) {
      el.addEventListener('input', function () {
        themeDraft[el.dataset.k] = el.value;
        var txt = wrap.querySelector('[data-k2="' + el.dataset.k + '"]');
        if (txt) txt.value = el.value;
      });
    });
  }

  async function saveTheme() {
    var r = await App.req('/theme/save', { method: 'POST', body: { entries: themeDraft } });
    App.toast(r.msg || (r.code === 0 ? '主题配置已保存' : '保存失败'), r.code !== 0);
  }

  async function resetThemeGroup() {
    if (!confirm('确定将当前分组重置为官方默认值？')) return;
    var r = await App.req('/theme/reset', { method: 'POST', body: { group: themeGroup } });
    App.toast(r.msg || '已重置');
    Views.theme(document.getElementById('viewHost'));
  }

  // ---------------- 系统设置 ----------------
  Views.config = async function (host) {
    var j = await App.req('/config');
    var c = (j && j.data) || {};
    host.innerHTML = '<div class="admin-card" style="max-width:760px"><div class="card-head"><h3>站点全局参数</h3></div>' +
      App.field('网站名称', App.input('cfSiteName', c.site_name)) +
      App.field('站点 URL', App.input('cfSiteUrl', c.site_url)) +
      App.field('SEO 关键词', App.input('cfKeywords', c.site_keywords)) +
      App.field('SEO 描述', App.textarea('cfDesc', c.site_description, 3)) +
      '<div class="row3">' +
      App.field('采集合并策略 urlrole', App.select('cfUrlrole', [{ value: '1', label: '1 = 智能合并追加' }, { value: '0', label: '0 = 完全覆盖' }], c.urlrole || '1')) +
      App.field('开放 XML 接口', App.select('cfXml', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.app_allow_xml || '1')) +
      App.field('开放会员注册', App.select('cfUserStatus', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.user_status || '1')) +
      '</div>' +
      '<div class="row2">' +
      App.field('注册赠送积分', App.input('cfRegPoints', c.user_reg_points || '50', '', 'number')) +
      App.field('定时采集密钥 timming_key', App.input('cfTimmingKey', c.timming_key)) +
      '</div>' +
      App.field('管理员账号', App.input('cfAdminUser', c.admin_user || 'admin')) +
      App.field('重设管理员密码 (留空不修改)', App.input('cfNewPwd', '', '输入新密码', 'password')) +
      '<button class="btn-create" id="cfgSaveBtn">保存系统设置</button></div>';

    App.on('cfgSaveBtn', 'click', async function () {
      var payload = {
        site_name: App.val('cfSiteName'), site_url: App.val('cfSiteUrl'),
        site_keywords: App.val('cfKeywords'), site_description: App.val('cfDesc'),
        urlrole: App.val('cfUrlrole'), app_allow_xml: App.val('cfXml'),
        user_status: App.val('cfUserStatus'), user_reg_points: App.val('cfRegPoints'),
        timming_key: App.val('cfTimmingKey'), admin_user: App.val('cfAdminUser')
      };
      var pwd = App.val('cfNewPwd');
      if (pwd) payload.new_password = pwd;
      var r = await App.req('/config', { method: 'POST', body: payload });
      if (r.code === 0) {
        App.toast('系统配置已保存');
        document.getElementById('cfNewPwd').value = '';
      } else App.toast(r.msg || '保存失败', true);
    });
  };
})(window);