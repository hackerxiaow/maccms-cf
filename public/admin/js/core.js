// ========================================================
// 后台控制台核心框架 (鉴权、导航、模态框、通用工具)
// ========================================================
(function (global) {
  'use strict';

  var API = '/api/admin';

  var modules = [
    { key: 'home', name: '工作台', permission: '', routes: ['overview'] },
    { key: 'content', name: '内容管理', permission: 'content', routes: ['vod', 'type', 'manga', 'art', 'topic', 'website', 'actor', 'transfer', 'recycle'] },
    { key: 'collect', name: '采集配置', permission: 'collect', routes: ['collect', 'player'] },
    { key: 'users', name: '用户中心', permission: 'users', routes: ['user', 'signs', 'messages', 'access'] },
    { key: 'ops', name: '运营互动', permission: 'ops', routes: ['gbook', 'comment', 'ads', 'urlsend', 'danmaku', 'chat', 'shares', 'cash', 'coupons', 'goods', 'seckill', 'mall-orders', 'notices', 'play-fails'] },
    { key: 'live', name: '直播管理', permission: 'ops', routes: ['live'] },
    { key: 'system', name: '系统管理', permission: 'system', routes: ['theme', 'tools', 'analytics', 'audit', 'apidoc', 'database', 'config', 'accounts', 'media', 'quality', 'tasks', 'monitor'] }
  ];

  var routeMeta = {
    overview: ['运行概览', '站点核心指标与协议入口', '⌂'],
    vod: ['视频管理', '影视内容、播放资源与批量运维', '▣'],
    type: ['分类体系', '多模型分类与模板配置', '☷'],
    manga: ['漫画管理', '漫画资料、连载状态与章节资源', '▤'],
    art: ['文章资讯', '文章发布与富文本管理', '✎'],
    topic: ['影视专题', '专题聚合与关联影片', '▧'],
    website: ['网址导航', 'MacCMS type_mid=11 站点目录管理与访问统计', '↗'],
    actor: ['明星角色', 'MacCMS 10 知识图谱 (actor / role)', '☆'],
    collect: ['采集中心', '资源站节点、分类映射与智能合并', '⇩'],
    player: ['播放与下载', '播放器、下载器与流媒体配置', '▷'],
    user: ['会员卡密', '会员账号、会员组权限、充值卡密与订单', '♙'],
    gbook: ['留言报错', '求片留言与播放器故障受理', '☏'],
    comment: ['评论审核', '全站评论筛选、审核与批量管理', '▤'],
    ads: ['广告友链', '广告位投放与友情链接', '▱'],
    live: ['直播频道', 'MacCMS10 直播分类、频道与播放源管理', '▹'],
    urlsend: ['URL 主动推送', '向百度推送已发布影片、文章、专题和明星页面', '↗'],
    analytics: ['访问统计', '内容详情访问趋势与热门内容统计', '▥'],
    audit: ['后台操作日志', '管理员写操作、响应状态与来源记录', '▤'],
    apidoc: ['开放接口文档', 'MacCMS v8/v10 Provide、REST 与直播接口说明', '⌘'],
    database: ['数据库维护', 'D1 表行数、JSON 备份导出与分批还原', '▦'],
    accounts: ['管理员与权限', '多管理员账号、角色权限和后台操作边界', '♙'],
    media: ['R2 媒体库', '将海报与图片上传到 Cloudflare R2 并管理引用地址', '▧'],
    quality: ['内容质检', '按可配置规则扫描标题、简介、播放源和图片字段', '✓'],
    tasks: ['边缘定时任务', '通过 Workers Cron 执行采集、日志清理与计数维护', '◷'],
    monitor: ['云端运行监控', '检查 D1 表、媒体桶绑定和后台任务状态', '⌁'],
    transfer: ['内容导入导出', 'JSON 批量迁移 MacCMS 内容模型', '⇵'],
    danmaku: ['弹幕审核', '审核或清理影片弹幕', '▤'],
    chat: ['聊天室审核', '管理实时聊天室消息', '☏'],
    messages: ['会员私信', '查看与管理会员站内私信', '✉'],
    shares: ['分享记录', '查看内容分享来源与访问记录', '↗'],
    cash: ['积分与资金流水', '人工调整会员积分并记录审计流水', '¥'],
    coupons: ['优惠券', '管理优惠码、折扣和领取额度', '％'],
    goods: ['积分商城商品', '管理商品、积分定价和库存', '▣'],
    seckill: ['限时秒杀', '秒杀活动、活动库存与会员订单', '◷'],
    'mall-orders': ['商城订单', '审核积分订单与线下待核验订单', '▤'],
    notices: ['站点公告', '管理站点公告与有效期', '▧'],
    signs: ['签到与里程碑奖励', '管理每日签到和连续签到积分奖励', '✓'],
    'play-fails': ['播放报错', '受理前台用户提交的播放故障', '⚠'],
    access: ['会员访问限制', '按来源 IP 或账号拦截注册与登录', '⊘'],
    recycle: ['内容回收站', '还原误删的影片、文章、专题、漫画、明星和网址', '♲'],
    theme: ['主题模板', '站点主题与模板参数配置', '◈'],
    tools: ['批量运维', '重名检测合并与全库字符替换', '⚙'],
    config: ['系统设置', '站点参数、URL、安全与全局配置', '⚙']
  };

  var App = {
    token: localStorage.getItem('maccms_admin_token') || '',
    permissions: JSON.parse(localStorage.getItem('maccms_admin_permissions') || '["*"]'),
    types: [],
    state: {},
    activeModule: 'home',
    activeView: 'overview',
    openTabs: ['overview'],

    headers: function () {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.token
      };
    },

    req: async function (path, opts) {
      opts = opts || {};
      var res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: this.headers(),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      var json;
      try { json = await res.json(); } catch (e) { json = { code: res.status, msg: '响应解析失败' }; }
      if (json.code === 401) {
        localStorage.removeItem('maccms_admin_token');
        location.reload();
        throw new Error('登录已过期');
      }
      return json;
    },

    login: async function () {
      var u = document.getElementById('adminUser').value.trim();
      var p = document.getElementById('adminPwd').value.trim();
      var tip = document.getElementById('loginTip');
      try {
        var res = await fetch(API + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        var json = await res.json();
        if (json.code === 0 && json.data.token) {
          this.token = json.data.token;
          localStorage.setItem('maccms_admin_token', this.token);
          localStorage.setItem('maccms_admin_user', json.data.username);
          localStorage.setItem('maccms_admin_permissions', JSON.stringify(json.data.permissions || ['*']));
          this.permissions = json.data.permissions || ['*'];
          document.getElementById('loginWrap').style.display = 'none';
          document.getElementById('adminContainer').style.display = 'block';
          this.boot();
        } else {
          tip.textContent = json.msg || '登录失败';
          tip.style.display = 'block';
        }
      } catch (e) {
        tip.textContent = '请求异常: ' + e.message;
        tip.style.display = 'block';
      }
    },

    logout: function () {
      localStorage.removeItem('maccms_admin_token');
      localStorage.removeItem('maccms_admin_permissions');
      location.reload();
    },

    setTheme: function (dark) {
      var theme = dark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('maccms_admin_theme', theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? '#141c27' : '#ffffff';
      var button = document.getElementById('themeToggle');
      var icon = document.getElementById('themeToggleIcon');
      var label = document.getElementById('themeToggleLabel');
      var action = dark ? '切换浅色模式' : '切换深色模式';
      if (icon) icon.textContent = dark ? '☀' : '◐';
      if (label) label.textContent = dark ? '浅色模式' : '深色模式';
      if (button) {
        button.title = action;
        button.setAttribute('aria-label', action);
      }
    },

    syncRailToggle: function () {
      var collapsed = document.getElementById('adminContainer').classList.contains('rail-collapsed');
      var button = document.getElementById('adminRailToggle');
      var icon = document.getElementById('adminRailIcon');
      var label = document.getElementById('adminRailLabel');
      var action = collapsed ? '展开侧栏' : '收起侧栏';
      if (icon) icon.textContent = collapsed ? '›' : '‹';
      if (label) label.textContent = action;
      if (button) {
        button.title = action;
        button.setAttribute('aria-label', action);
      }
    },

    boot: async function () {
      document.getElementById('lblAdminUser').textContent = localStorage.getItem('maccms_admin_user') || 'admin';
      var self = this;
      this.setTheme(localStorage.getItem('maccms_admin_theme') === 'dark');
      var themeToggle = document.getElementById('themeToggle');
      if (themeToggle) themeToggle.onclick = function () {
        self.setTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
      };
      var menuButton = document.getElementById('adminMenuToggle');
      var shade = document.getElementById('sidebarShade');
      if (menuButton) menuButton.onclick = function () { self.toggleSidebar(); };
      if (shade) shade.onclick = function () { self.toggleSidebar(false); };
      var mainNav = document.getElementById('mainNav');
      if (mainNav) mainNav.onclick = function (event) {
        var button = event.target.closest('[data-module]');
        if (button) self.switchModule(button.dataset.module);
      };
      var mobileModuleNav = document.getElementById('mobileModuleNav');
      if (mobileModuleNav) mobileModuleNav.onclick = function (event) {
        var button = event.target.closest('[data-module]');
        if (button) self.switchModule(button.dataset.module);
      };
      var sidebar = document.getElementById('sidebarMenu');
      if (sidebar) sidebar.onclick = function (event) {
        var button = event.target.closest('[data-nav]');
        if (button) self.nav(button.dataset.nav);
      };
      var tabs = document.getElementById('tabStrip');
      if (tabs) tabs.onclick = function (event) {
        var close = event.target.closest('[data-close-tab]');
        if (close) {
          event.stopPropagation();
          self.closeTab(close.dataset.closeTab);
          return;
        }
        var tab = event.target.closest('[data-tab]');
        if (tab) self.nav(tab.dataset.tab, false);
      };
      var railToggle = document.getElementById('adminRailToggle');
      if (railToggle) railToggle.onclick = function () {
        var collapsed = document.getElementById('adminContainer').classList.toggle('rail-collapsed');
        localStorage.setItem('maccms_admin_rail_collapsed', collapsed ? '1' : '0');
        self.syncRailToggle();
      };
      var refresh = document.getElementById('refreshView');
      if (refresh) refresh.onclick = function () { self.nav(self.activeView, false); };
      if (localStorage.getItem('maccms_admin_rail_collapsed') === '1' && railToggle) {
        document.getElementById('adminContainer').classList.add('rail-collapsed');
      }
      this.syncRailToggle();
      await this.loadTypes();
      this.renderMainNav();
      this.nav('overview');
    },

    loadTypes: async function () {
      var json = await this.req('/type/list');
      if (json.code === 0) this.types = json.data || [];
      return this.types;
    },

    renderMainNav: function () {
      var host = document.getElementById('mainNav');
      if (!host) return;
      var availableModules = modules.filter(function (module) { return !module.permission || App.canAccess(module.permission); });
      host.innerHTML = availableModules.map(function (module) {
        return '<button type="button" data-module="' + module.key + '" class="' +
          (module.key === App.activeModule ? 'active' : '') + '">' + App.esc(module.name) + '</button>';
      }).join('');
      var mobileHost = document.getElementById('mobileModuleNav');
      if (mobileHost) mobileHost.innerHTML = availableModules.map(function (module) {
        return '<button type="button" data-module="' + module.key + '" class="' +
          (module.key === App.activeModule ? 'active' : '') + '">' + App.esc(module.name) + '</button>';
      }).join('');
      this.renderSidebar();
      this.renderTabs();
    },

    switchModule: function (key) {
      var module = modules.find(function (item) { return item.key === key; });
      if (!module || (module.permission && !this.canAccess(module.permission))) return;
      this.activeModule = key;
      this.renderMainNav();
      this.nav(module.routes[0]);
    },

    renderSidebar: function () {
      var module = modules.find(function (item) { return item.key === App.activeModule; }) || modules[0];
      var title = document.getElementById('sidebarModuleTitle');
      var host = document.getElementById('sidebarMenu');
      if (title) title.textContent = module.name;
      if (!host) return;
      host.innerHTML = module.routes.filter(function (key) {
        var viewPermission = modules.find(function (item) { return item.routes.indexOf(key) >= 0; })?.permission;
        return !viewPermission || App.canAccess(viewPermission);
      }).map(function (key) {
        var meta = routeMeta[key] || [key, '', '·'];
        return '<li><button class="menu-item" type="button" data-nav="' + key + '"><span class="menu-icon">' +
          meta[2] + '</span><span class="menu-label">' + App.esc(meta[0]) + '</span></button></li>';
      }).join('');
      host.querySelectorAll('[data-nav]').forEach(function (button) {
        button.classList.toggle('active', button.dataset.nav === App.activeView);
      });
    },

    renderTabs: function () {
      var host = document.getElementById('tabStrip');
      if (!host) return;
      host.innerHTML = this.openTabs.map(function (key) {
        var meta = routeMeta[key] || [key, '', '·'];
        return '<button class="admin-tab' + (key === App.activeView ? ' active' : '') + '" type="button" data-tab="' + key + '" role="tab" aria-selected="' + (key === App.activeView ? 'true' : 'false') + '">' +
          '<span>' + App.esc(meta[0]) + '</span>' + (key === 'overview' ? '' : '<span class="admin-tab-close" data-close-tab="' + key + '" aria-label="关闭标签">×</span>') + '</button>';
      }).join('');
    },

    closeTab: function (key) {
      if (key === 'overview') return;
      this.openTabs = this.openTabs.filter(function (item) { return item !== key; });
      if (this.activeView === key) this.nav(this.openTabs[this.openTabs.length - 1] || 'overview', false);
      else this.renderTabs();
    },

    nav: function (key, addTab) {
      var module = modules.find(function (item) { return item.routes.indexOf(key) >= 0; });
      if (!module) key = 'overview', module = modules[0];
      if (module.permission && !this.canAccess(module.permission)) {
        module = modules.find(function (item) { return !item.permission || App.canAccess(item.permission); }) || modules[0];
        key = module.routes[0];
      }
      this.activeModule = module.key;
      this.activeView = key;
      if (addTab !== false && this.openTabs.indexOf(key) < 0) this.openTabs.push(key);
      this.renderMainNav();
      this.renderSidebar();
      this.renderTabs();
      var t = routeMeta[key] || ['控制台', ''];
      document.getElementById('viewHeading').textContent = t[0];
      document.getElementById('viewSub').textContent = t[1];
      var host = document.getElementById('viewHost');
      host.innerHTML = '<div class="empty">正在载入…</div>';
      if (global.Views && Views[key]) {
        Views[key](host);
      } else {
        host.innerHTML = '<div class="empty">模块建设中</div>';
      }
      this.toggleSidebar(false);
    },

    toggleSidebar: function (open) {
      var container = document.getElementById('adminContainer');
      var button = document.getElementById('adminMenuToggle');
      if (!container) return;
      var shouldOpen = open === undefined ? !container.classList.contains('sidebar-open') : !!open;
      container.classList.toggle('sidebar-open', shouldOpen);
      if (button) button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    },

    canAccess: function (permission) {
      return !permission || this.permissions.includes('*') || this.permissions.includes(permission);
    },

    // ---------- UI 工具 ----------
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    toast: function (msg, isErr) {
      var wrap = document.getElementById('toastWrap');
      var el = document.createElement('div');
      el.className = 'toast' + (isErr ? ' err' : '');
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(function () { el.remove(); }, 3200);
    },

    modal: function (title, bodyHtml, onOk, okText) {
      var host = document.getElementById('modalHost');
      host.innerHTML =
        '<div class="modal-mask show" id="appModal"><div class="modal-content">' +
        '<h3>' + this.esc(title) + '</h3>' +
        '<div id="modalBody">' + bodyHtml + '</div>' +
        '<div class="modal-actions">' +
        '<button class="btn-plain" onclick="App.closeModal()">取消</button>' +
        '<button class="btn-create" id="modalOkBtn">' + this.esc(okText || '保存') + '</button>' +
        '</div></div></div>';
      var self = this;
      document.getElementById('modalOkBtn').onclick = function () {
        if (onOk) onOk();
      };
    },

    closeModal: function () {
      document.getElementById('modalHost').innerHTML = '';
    },

    field: function (label, inner) {
      return '<div class="form-group"><label class="form-label">' + this.esc(label) + '</label>' + inner + '</div>';
    },

    input: function (id, value, placeholder, type) {
      return '<input class="input-box" id="' + id + '" type="' + (type || 'text') + '" value="' +
        this.esc(value == null ? '' : value) + '" placeholder="' + this.esc(placeholder || '') + '">';
    },

    textarea: function (id, value, rows) {
      return '<textarea class="input-box" id="' + id + '" rows="' + (rows || 4) + '">' + this.esc(value || '') + '</textarea>';
    },

    select: function (id, options, selected, blankText) {
      var html = '<select class="admin-select" id="' + id + '">';
      if (blankText !== undefined && blankText !== null) {
        html += '<option value="">' + this.esc(blankText) + '</option>';
      }
      options.forEach(function (o) {
        html += '<option value="' + o.value + '"' + (String(o.value) === String(selected) ? ' selected' : '') + '>' +
          App.esc(o.label) + '</option>';
      });
      return html + '</select>';
    },

    typeOptions: function () {
      return App.types.map(function (t) {
        return { value: t.type_id, label: (t.type_pid > 0 ? '└ ' : '') + t.type_name };
      });
    },

    val: function (id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : '';
    },

    intVal: function (id) {
      var v = parseInt(this.val(id), 10);
      return isNaN(v) ? 0 : v;
    },

    pager: function (data, onGo) {
      if (!data || data.pagecount <= 1) return '';
      var html = '<div class="pager">';
      if (data.page > 1) html += '<button class="action-btn" data-page="' + (data.page - 1) + '">上一页</button>';
      html += '<span>' + data.page + ' / ' + data.pagecount + ' （共 ' + data.total + ' 条）</span>';
      if (data.page < data.pagecount) html += '<button class="action-btn" data-page="' + (data.page + 1) + '">下一页</button>';
      html += '</div>';
      setTimeout(function () {
        document.querySelectorAll('.pager [data-page]').forEach(function (b) {
          b.onclick = function () { onGo(parseInt(b.dataset.page, 10)); };
        });
      }, 0);
      return html;
    },

    fmtTime: function (ts) {
      return ts ? new Date(ts * 1000).toLocaleString() : '-';
    },

    on: function (id, event, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(event, fn);
    }
  };

  global.App = App;

  App.setTheme(localStorage.getItem('maccms_admin_theme') === 'dark');

  if (App.token) {
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'block';
    App.boot();
  }
})(window);
