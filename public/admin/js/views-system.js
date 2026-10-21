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
      App.field('开放全站评论', App.select('cfCommentStatus', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.comment_status || '1')) +
      App.field('新评论审核', App.select('cfCommentAudit', [{ value: '0', label: '直接显示' }, { value: '1', label: '管理员审核后显示' }], c.comment_audit || '0')) +
      '</div>' +
      '<div class="row3">' +
      App.field('弹幕审核', App.select('cfDanmakuAudit', [{ value: '1', label: '审核后显示' }, { value: '0', label: '直接显示' }], c.danmaku_audit || '1')) +
      App.field('聊天室审核', App.select('cfChatAudit', [{ value: '1', label: '审核后显示' }, { value: '0', label: '直接显示' }], c.chat_audit || '1')) +
      App.field('每日签到奖励积分', App.input('cfSignPoints', c.sign_reward_points || '5', '', 'number')) +
      '</div>' +
      '<div class="row2">' +
      App.field('注册赠送积分', App.input('cfRegPoints', c.user_reg_points || '50', '', 'number')) +
      App.field('定时采集密钥 timming_key', App.input('cfTimmingKey', c.timming_key)) +
      '</div>' +
      '<div class="row3">' +
      App.field('邀请奖励', App.select('cfInviteStatus', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.user_invite_status || '0')) +
      App.field('邀请人奖励积分', App.input('cfInvitePoints', c.user_invite_points || '50', '', 'number')) +
      App.field('受邀注册奖励积分', App.input('cfInvitedPoints', c.user_invited_points || '0', '', 'number')) +
      '</div><p class="sub">开启后，新会员可填写邀请人的邀请码；邀请奖励仅在注册成功时发放一次。</p>' +
      '<div class="admin-divider"></div><div class="card-head"><h3>会员邮箱与找回密码</h3></div>' +
      '<div class="row2">' +
      App.field('强制邮箱验证后登录', App.select('cfEmailRequired', [{ value: '0', label: '关闭' }, { value: '1', label: '开启' }], c.user_email_required || '0')) +
      App.field('开放邮箱验证入口', App.select('cfEmailVerify', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.user_email_verification || '0')) +
      '</div>' +
      App.field('会员动态人工审核', App.select('cfPostAudit', [{ value: '0', label: '直接发布' }, { value: '1', label: '审核后发布' }], c.user_post_audit || '0')) +
      '<div class="row2">' +
      App.field('SMTP 主机', App.input('cfMailHost', c.mail_smtp_host || '', '例如 smtp.example.com')) +
      App.field('SMTP 端口', App.input('cfMailPort', c.mail_smtp_port || '587', '587 或 465', 'number')) +
      '</div>' +
      '<div class="row3">' +
      App.field('SMTP 用户名', App.input('cfMailUser', c.mail_smtp_username || '')) +
      App.field('SMTP 授权码 / 密码', App.input('cfMailPassword', '', c.mail_smtp_password_set === '1' ? '已设置，留空保持不变' : '请输入 SMTP 密码', 'password')) +
      App.field('发件人地址', App.input('cfMailFrom', c.mail_from || '', 'MacCMS <noreply@example.com>')) +
      '</div><div class="row3">' +
      App.field('TLS 连接', App.select('cfMailSecure', [{ value: '0', label: 'STARTTLS（常见 587）' }, { value: '1', label: 'TLS（常见 465）' }], c.mail_smtp_secure || '0')) +
      App.field('STARTTLS 升级', App.select('cfMailStarttls', [{ value: '1', label: '开启' }, { value: '0', label: '关闭' }], c.mail_smtp_starttls || '1')) +
      App.field('SMTP 认证方式', App.select('cfMailAuth', [{ value: 'plain', label: 'PLAIN' }, { value: 'login', label: 'LOGIN' }, { value: 'cram-md5', label: 'CRAM-MD5' }], c.mail_smtp_auth_type || 'plain')) +
      '</div>' +
      '<p class="sub">邮件由 worker-mailer 通过 Cloudflare Workers TCP Sockets 发送。验证码 10 分钟有效，并按 IP 与邮箱限频。开启强制验证前，请先配置 SMTP。</p>' +
      '<div class="toolbar"><input class="admin-input" id="cfMailTestTo" type="email" placeholder="测试收件邮箱" style="max-width:320px"><button class="action-btn" id="cfgMailTest">发送测试邮件</button><span class="sub">请先保存 SMTP 设置，再发送测试邮件。</span></div>' +
      '<div class="admin-divider"></div><div class="card-head"><h3>在线支付与搜索服务</h3></div>' +
      '<div class="row2">' +
      App.field('兼容支付收银台 URL', App.input('cfPayUrl', c.payment_checkout_url || '')) +
      App.field('支付查询接口 URL（可选）', App.input('cfPayQueryUrl', c.payment_query_url || '')) +
      '</div>' +
      '<div class="row3">' +
      App.field('商户 ID', App.input('cfPayMerchant', c.payment_merchant_id || '')) +
      App.field('币种', App.input('cfPayCurrency', c.payment_currency || 'CNY')) +
      App.field('支付回调签名密钥', App.input('cfPaySecret', '', c.payment_secret_set === '1' ? '已设置，留空保持不变' : '请输入共享密钥', 'password')) +
      '</div>' +
      App.field('在线支付套餐 JSON', App.textarea('cfPayProducts', c.payment_products || '[]', 7)) +
      '<div class="row2">' +
      App.field('Meilisearch URL', App.input('cfMeiliUrl', c.meilisearch_url || '')) +
      App.field('Meilisearch API Key', App.input('cfMeiliKey', '', c.meilisearch_api_key_set === '1' ? '已设置，留空保持不变' : '请输入 Search API Key', 'password')) +
      '</div><div class="toolbar"><button class="action-btn" id="cfgSearchSync">同步 Meilisearch 索引</button><span class="sub" id="cfgSearchStatus">正在读取搜索统计…</span></div>' +
      '<div id="cfgSearchStats" class="sub"></div><p class="sub">支付需配置支持本项目签名参数的托管收银台；Meilisearch 未配置时仍使用 D1 搜索。</p>' +
      '<div class="admin-divider"></div><div class="card-head"><h3>AI 内容助手</h3><button class="action-btn" id="cfgOpenAi">打开 AI 助手</button></div>' +
      '<div class="row3">' + App.field('OpenAI 兼容 API 根地址',App.input('cfAiUrl',c.ai_base_url||'','例如 https://api.example.com/v1')) +
      App.field('模型名称',App.input('cfAiModel',c.ai_model||'','例如 gpt-4o-mini')) +
      App.field('API Key',App.input('cfAiKey','','请输入 API Key','password')) + '</div>' +
      '<p class="sub">仅在管理员点击生成时，将所选内容的文字字段发送给已配置的模型。生成结果不会自动写回数据库，需审核后手动采用。</p>' +
      '<div class="admin-divider"></div><div class="card-head"><h3>Web Push 通知</h3><button class="action-btn" id="cfgPushGenerate">生成 VAPID 密钥</button></div>' +
      '<div class="sub" id="cfgPushStatus">正在读取推送状态…</div>' +
      App.field('VAPID 联系方式', App.input('cfPushSubject', c.push_vapid_subject || 'mailto:admin@example.com', 'mailto:管理员邮箱')) +
      '<div class="row3">' +
      App.field('通知标题', App.input('cfNoticeTitle', '', '站内通知')) +
      App.field('定向会员 ID（0 为全站）', App.input('cfNoticeUser', '0', '', 'number')) +
      App.field('站内跳转地址', App.input('cfNoticeUrl', '', '/user.html 或内容页')) +
      '</div>' +
      App.field('通知内容', App.textarea('cfNoticeBody', '', 3)) +
      '<button class="action-btn" id="cfgNoticeSend">发送站内通知并推送</button>' +
      '<div class="admin-divider"></div><div class="card-head"><h3>附件存储后端</h3><button class="action-btn" id="cfgStorageTestBtn">测试当前存储</button></div>' +
      '<div class="row2">' +
      App.field('图片存储后端', App.select('cfMediaProvider', [{ value: 'r2', label: 'Cloudflare R2' }, { value: 'telegram', label: 'TG Bot 多账户池（推荐）' }, { value: 'telegraph', label: '连接已部署的 Telegraph 服务' }], c.media_storage_provider || 'r2')) +
      App.field('Telegram Bot API 地址', App.input('cfTelegramApi', c.telegram_api_base || 'https://api.telegram.org')) +
      '</div><p class="sub">TG Bot 模式在媒体库管理多个 Bot 与频道，按权重轮询上传。文件 URL 由本站代理读取 Telegram 文件，切换或停用账户不会影响已存图片。</p>' +
      '<div class="row3">' +
      App.field('Telegraph 服务地址', App.input('cfTelegraphUrl', c.telegraph_base_url || '')) +
      App.field('Telegraph USERNAME', App.input('cfTelegraphUser', c.telegraph_username || '')) +
      App.field('Telegraph PASSWORD', App.input('cfTelegraphPassword', '', c.telegraph_password_set === '1' ? '已设置，留空保持不变' : '请输入 PASSWORD', 'password')) +
      '</div><div class="row2">' +
      App.field('远端 ENABLE_AUTH', App.select('cfTelegraphAuth', [{ value: '1', label: '已开启，需要账号密码' }, { value: '0', label: '未开启访客验证' }], c.telegraph_auth_enabled || '0')) +
      '<div class="form-group"><label class="form-label">账户池管理</label><button class="action-btn" id="cfgManageTgAccounts">管理多个 TG Bot 账户</button></div>' +
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
        user_invite_status: App.val('cfInviteStatus'), user_invite_points: App.val('cfInvitePoints'), user_invited_points: App.val('cfInvitedPoints'),
        user_email_required: App.val('cfEmailRequired'), user_email_verification: App.val('cfEmailVerify'),
        user_post_audit: App.val('cfPostAudit'),
        mail_smtp_host: App.val('cfMailHost'), mail_smtp_port: App.val('cfMailPort'),
        mail_smtp_username: App.val('cfMailUser'), mail_from: App.val('cfMailFrom'),
        mail_smtp_secure: App.val('cfMailSecure'), mail_smtp_starttls: App.val('cfMailStarttls'), mail_smtp_auth_type: App.val('cfMailAuth'),
        payment_checkout_url: App.val('cfPayUrl'), payment_query_url: App.val('cfPayQueryUrl'), payment_merchant_id: App.val('cfPayMerchant'),
        payment_currency: App.val('cfPayCurrency'), payment_products: App.val('cfPayProducts'),
        meilisearch_url: App.val('cfMeiliUrl'),
        ai_base_url: App.val('cfAiUrl'), ai_model: App.val('cfAiModel'),
        push_vapid_subject: App.val('cfPushSubject'),
        comment_status: App.val('cfCommentStatus'),
        comment_audit: App.val('cfCommentAudit'),
        danmaku_audit: App.val('cfDanmakuAudit'), chat_audit: App.val('cfChatAudit'), sign_reward_points: App.val('cfSignPoints'),
        timming_key: App.val('cfTimmingKey'), admin_user: App.val('cfAdminUser'),
        media_storage_provider: App.val('cfMediaProvider'), telegram_api_base: App.val('cfTelegramApi'),
        telegraph_base_url: App.val('cfTelegraphUrl'), telegraph_username: App.val('cfTelegraphUser'), telegraph_auth_enabled: App.val('cfTelegraphAuth')
      };
      var pwd = App.val('cfNewPwd');
      if (pwd) payload.new_password = pwd;
      var telegraphPwd = App.val('cfTelegraphPassword');
      if (telegraphPwd) payload.telegraph_password = telegraphPwd;
      var mailPassword = App.val('cfMailPassword');
      if (mailPassword) payload.mail_smtp_password = mailPassword;
      var paymentSecret = App.val('cfPaySecret');
      if (paymentSecret) payload.payment_secret = paymentSecret;
      var meiliKey = App.val('cfMeiliKey');
      if (meiliKey) payload.meilisearch_api_key = meiliKey;
      var aiKey = App.val('cfAiKey');
      if (aiKey) payload.ai_api_key = aiKey;
      var r = await App.req('/config', { method: 'POST', body: payload });
      if (r.code === 0) {
        App.toast('系统配置已保存');
        document.getElementById('cfNewPwd').value = '';
        ['cfMailPassword','cfPaySecret','cfMeiliKey','cfAiKey'].forEach(function(id){var field=document.getElementById(id);if(field)field.value='';});
      } else App.toast(r.msg || '保存失败', true);
    });
    App.on('cfgStorageTestBtn', 'click', async function(){var r=await App.req('/cloud/media/storage/test',{method:'POST',body:{}});App.toast(r.msg||'测试完成',r.code!==0);});
    App.on('cfgMailTest', 'click', async function(){var email=App.val('cfMailTestTo');if(!email){App.toast('请填写测试收件邮箱',true);return;}var r=await App.req('/config/mail/test',{method:'POST',body:{email:email}});App.toast(r.msg||'测试邮件发送完成',r.code!==0);});
    App.on('cfgManageTgAccounts', 'click', function(){App.nav('media');});
    App.on('cfgOpenAi', 'click', function(){App.nav('ai');});
    async function loadSearchStats(){var s=await App.req('/cloud/search/stats?days=30');if(s.code!==0)return;var d=s.data||{},t=d.totals||{};var status=document.getElementById('cfgSearchStatus');if(status)status.textContent='近 30 天搜索 '+Number(t.searches||0)+' 次 · 零结果 '+Number(t.empty||0)+' 次 · Meilisearch '+Number(t.meilisearch||0)+' 次 · 最近同步 '+(d.last_sync?App.fmtTime(d.last_sync):'未同步');var host=document.getElementById('cfgSearchStats');if(host)host.innerHTML=(d.days||[]).map(function(day){return '<span style="display:inline-block;margin:3px 8px 3px 0">'+App.esc(day.day)+'：'+Number(day.searches||0)+' 次（零结果 '+Number(day.empty||0)+'）</span>';}).join('');}
    loadSearchStats();
    App.on('cfgSearchSync','click',async function(){var button=document.getElementById('cfgSearchSync');if(button)button.disabled=true;var result=await App.req('/cloud/search/sync',{method:'POST',body:{}});App.toast(result.msg||'索引同步完成',result.code!==0);if(button)button.disabled=false;loadSearchStats();});
    async function loadPushStatus(){var result=await App.req('/cloud/push/status');if(result.code!==0)return;var data=result.data||{},status=document.getElementById('cfgPushStatus'),button=document.getElementById('cfgPushGenerate');if(status)status.textContent=(data.configured?'VAPID 已配置':'尚未配置 VAPID')+' · '+Number(data.subscriptions||0)+' 个设备订阅 · '+Number(data.members||0)+' 位会员';if(button){button.disabled=Boolean(data.configured);button.textContent=data.configured?'VAPID 已配置':'生成 VAPID 密钥';}}
    loadPushStatus();
    App.on('cfgPushGenerate','click',async function(){var result=await App.req('/cloud/push/vapid/generate',{method:'POST',body:{}});App.toast(result.msg||'密钥生成完成',result.code!==0);loadPushStatus();});
    App.on('cfgNoticeSend','click',async function(){var title=App.val('cfNoticeTitle'),body=App.val('cfNoticeBody');if(!title||!body){App.toast('请填写通知标题和内容',true);return;}var result=await App.req('/cloud/notifications/send',{method:'POST',body:{title:title,body:body,user_id:App.intVal('cfNoticeUser'),target_url:App.val('cfNoticeUrl')}});App.toast(result.msg||'通知已发送',result.code!==0);});
  };

  Views.ai = async function(host){
    host.innerHTML='<div class="admin-card"><div class="card-head"><h3>AI 内容助手</h3><span class="sub" id="aiConfigStatus">读取配置中…</span></div><div class="row3"><div class="form-group"><label class="form-label">内容模型</label><select id="aiContentModel" class="admin-select"><option value="vod">视频</option><option value="art">文章</option><option value="topic">专题</option><option value="actor">明星</option><option value="role">角色</option><option value="manga">漫画</option><option value="website">网址</option></select></div>'+App.field('内容 ID',App.input('aiRecordId','','必填','number'))+'<div class="form-group"><label class="form-label">任务</label><select id="aiTask" class="admin-select"><option value="summary">撰写简介</option><option value="metadata">标签与分类建议</option><option value="seo">SEO 标题与描述</option></select></div></div><div class="toolbar"><button class="btn-create" id="aiGenerate">生成建议</button><button class="action-btn" id="aiCopy">复制结果</button></div>'+App.field('AI 建议（需人工审核）',App.textarea('aiSuggestion','',14))+'<p class="sub">AI 只读取所选内容的文字字段。生成结果不自动保存，避免未审核内容覆盖现有资料。</p></div>';
    var status=await App.req('/cloud/ai/status');var statusNode=document.getElementById('aiConfigStatus');if(statusNode){var d=status.data||{};statusNode.textContent=d.configured?'已配置 · '+App.esc(d.model):'未配置，请先在系统设置填写 API 根地址、模型和 Key';}
    App.on('aiGenerate','click',async function(){var button=document.getElementById('aiGenerate');button.disabled=true;try{var result=await App.req('/cloud/ai/generate',{method:'POST',body:{model:App.val('aiContentModel'),record_id:App.intVal('aiRecordId'),task:App.val('aiTask')}});if(result.code!==0){App.toast(result.msg||'生成失败',true);return;}document.getElementById('aiSuggestion').value=(result.data||{}).suggestion||'';App.toast(result.msg||'生成完成');}finally{button.disabled=false;}});
    App.on('aiCopy','click',async function(){var value=App.val('aiSuggestion');if(!value){App.toast('没有可复制的结果',true);return;}try{await navigator.clipboard.writeText(value);App.toast('已复制');}catch{App.toast('浏览器不允许复制，请手动选择文本',true);}});
  };
})(window);
