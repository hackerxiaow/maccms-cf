// ========================================================
// 后台控制台核心框架 (鉴权、导航、模态框、通用工具)
// ========================================================
(function (global) {
  'use strict';

  var API = '/api/admin';

  var App = {
    token: localStorage.getItem('maccms_admin_token') || '',
    types: [],
    state: {},

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
          document.getElementById('loginWrap').style.display = 'none';
          document.getElementById('adminContainer').style.display = 'flex';
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
      location.reload();
    },

    boot: async function () {
      document.getElementById('lblAdminUser').textContent = localStorage.getItem('maccms_admin_user') || 'admin';
      var self = this;
      document.querySelectorAll('#sidebarMenu .menu-item[data-nav]').forEach(function (li) {
        li.onclick = function () { self.nav(li.dataset.nav); };
      });
      await this.loadTypes();
      this.nav('overview');
    },

    loadTypes: async function () {
      var json = await this.req('/type/list');
      if (json.code === 0) this.types = json.data || [];
      return this.types;
    },

    nav: function (key) {
      var titles = {
        overview: ['运行概览', '站点核心指标与协议入口'],
        vod: ['视频管理', '全字段影视数据、批量运维、重名合并'],
        type: ['分类体系', '统一多模型无限极分类树'],
        art: ['文章资讯', '文章发布与富文本管理'],
        topic: ['影视专题', '专题聚合与关联影片'],
        actor: ['明星角色', 'MacCMS 10 知识图谱 (actor / role)'],
        collect: ['采集中心', '资源站节点、分类映射与智能合并'],
        player: ['播放与下载', '播放器双解析、下载器与流媒体服务器'],
        user: ['会员卡密', '会员账号、会员组权限、充值卡密'],
        gbook: ['留言报错', '求片留言与播放器故障受理'],
        comment: ['影评管理', '全站评论审核与清理'],
        ads: ['广告友链', '广告位投放与友情链接'],
        theme: ['海螺主题', 'Conch_M003 全量主题参数可视化配置'],
        tools: ['批量运维', '重名检测合并与全库字符替换'],
        config: ['系统设置', '站点参数、URL、安全与全局配置']
      };
      var t = titles[key] || ['控制台', ''];
      document.getElementById('viewHeading').textContent = t[0];
      document.getElementById('viewSub').textContent = t[1];
      document.querySelectorAll('#sidebarMenu .menu-item[data-nav]').forEach(function (li) {
        li.classList.toggle('active', li.dataset.nav === key);
      });
      var host = document.getElementById('viewHost');
      host.innerHTML = '<div class="empty">正在载入…</div>';
      if (global.Views && Views[key]) {
        Views[key](host);
      } else {
        host.innerHTML = '<div class="empty">模块建设中</div>';
      }
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

  if (App.token) {
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'flex';
    App.boot();
  }
})(window);