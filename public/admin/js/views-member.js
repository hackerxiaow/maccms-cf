// ========================================================
// 后台视图：会员 / 会员组 / 卡密 / 留言报错 / 评论
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  // ---------------- 会员中心 ----------------
  Views.user = function (host) {
    host.innerHTML =
      '<div class="tabs-line" id="userTabs">' +
      '<a class="active" data-tab="users">会员账号</a><a data-tab="groups">会员组权限</a><a data-tab="cards">充值卡密</a>' +
      '</div><div id="userPane"></div>';
    document.querySelectorAll('#userTabs a').forEach(function (a) {
      a.onclick = function () {
        document.querySelectorAll('#userTabs a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        if (a.dataset.tab === 'users') renderUsers();
        else if (a.dataset.tab === 'groups') renderGroups();
        else renderCards();
      };
    });
    renderUsers();
  };

  async function renderUsers() {
    var pane = document.getElementById('userPane');
    pane.innerHTML = '<div class="toolbar"><input class="input-box" id="userKw" placeholder="账号 / 昵称 / 邮箱" style="max-width:240px">' +
      '<button class="action-btn" id="userSearchBtn">搜索</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>账号</th><th>昵称</th><th>会员组</th><th>积分</th><th>VIP 到期</th><th>状态</th><th>操作</th>' +
      '</tr></thead><tbody id="userBody"></tbody></table></div><div id="userPager"></div></div>';
    App.on('userSearchBtn', 'click', function () { loadUsers(1); });
    loadUsers(1);
  }

  async function loadUsers(page) {
    var q = '?page=' + page + '&limit=20';
    var kw = App.val('userKw');
    if (kw) q += '&wd=' + encodeURIComponent(kw);
    var j = await App.req('/user/list' + q);
    var body = document.getElementById('userBody');
    if (!body) return;
    var list = (j.data && j.data.list) || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">暂无会员</td></tr>'; return; }
    body.innerHTML = list.map(function (u) {
      var vip = u.user_end_time && u.user_end_time * 1000 > Date.now() ? new Date(u.user_end_time * 1000).toLocaleDateString() : '未开通';
      return '<tr><td>' + u.user_id + '</td><td><b>' + App.esc(u.user_name) + '</b></td>' +
        '<td>' + App.esc(u.user_nick) + '</td><td><span class="tag">' + App.esc(u.group_name || u.group_id) + '</span></td>' +
        '<td><span class="tag gold">' + u.user_points + '</span></td><td>' + vip + '</td>' +
        '<td>' + (u.user_status ? '<span class="tag green">正常</span>' : '<span class="tag red">封禁</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + u.user_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + u.user_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#userBody [data-edit]').forEach(function (b) {
      b.onclick = function () {
        var u = list.find(function (x) { return x.user_id === parseInt(b.dataset.edit, 10); });
        openUserModal(u);
      };
    });
    document.querySelectorAll('#userBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该会员及其日志？')) return;
        await App.req('/user/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadUsers(page);
      };
    });
    document.getElementById('userPager').innerHTML = App.pager(j.data, loadUsers);
  }

  async function openUserModal(u) {
    var groups = await App.req('/group/list');
    var options = (groups.data || []).map(function (g) { return { value: g.group_id, label: g.group_name }; });
    var body =
      '<div class="row3">' +
      App.field('账号', App.input('uName', u.user_name)) +
      App.field('昵称', App.input('uNick', u.user_nick)) +
      App.field('会员组', App.select('uGroup', options, u.group_id)) +
      '</div>' +
      '<div class="row3">' +
      App.field('积分余额', App.input('uPoints', u.user_points, '', 'number')) +
      App.field('状态', App.select('uStatus', [{ value: 1, label: '正常' }, { value: 0, label: '封禁' }], u.user_status === 0 ? 0 : 1)) +
      App.field('VIP 到期时间戳', App.input('uEndTime', u.user_end_time || 0, '', 'number')) +
      '</div>' +
      App.field('重置密码 (留空不修改)', App.input('uNewPwd', '', '输入新密码', 'password')) +
      '<div class="help-block">VIP 到期时间戳示例：当前时间 + 30 天 = ' + (Math.floor(Date.now() / 1000) + 2592000) + '</div>';
    App.modal('编辑会员 #' + u.user_id, body, async function () {
      var payload = {
        user_id: u.user_id,
        group_id: App.intVal('uGroup'), user_nick: App.val('uNick'),
        user_points: App.intVal('uPoints'), user_status: App.intVal('uStatus'),
        user_end_time: App.intVal('uEndTime'), new_pwd: App.val('uNewPwd'),
        user_email: u.user_email, user_phone: u.user_phone
      };
      var r = await App.req('/user/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('会员信息已更新'); loadUsers(1); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  async function renderGroups() {
    var j = await App.req('/group/list');
    var pane = document.getElementById('userPane');
    var list = j.data || [];
    pane.innerHTML = '<div class="admin-card"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>会员组名称</th><th>日 VIP 积分</th><th>周 VIP</th><th>月 VIP</th><th>年 VIP</th><th>全站免扣点</th><th>操作</th>' +
      '</tr></thead><tbody id="groupBody"></tbody></table></div>';
    var body = document.getElementById('groupBody');
    body.innerHTML = list.map(function (g) {
      return '<tr><td>' + g.group_id + '</td><td><b>' + App.esc(g.group_name) + '</b></td>' +
        '<td>' + g.group_points_day + '</td><td>' + g.group_points_week + '</td><td>' + g.group_points_month + '</td>' +
        '<td>' + g.group_points_year + '</td><td>' + (g.group_points_free ? '<span class="tag green">免扣点</span>' : '<span class="tag">按次扣点</span>') + '</td>' +
        '<td><button class="action-btn" data-gid="' + g.group_id + '">编辑</button></td></tr>';
    }).join('');
    document.querySelectorAll('#groupBody [data-gid]').forEach(function (b) {
      b.onclick = function () {
        var g = list.find(function (x) { return x.group_id === parseInt(b.dataset.gid, 10); });
        openGroupModal(g);
      };
    });
  }

  function openGroupModal(g) {
    g = g || {};
    var body =
      App.field('会员组名称 *', App.input('gName', g.group_name)) +
      '<div class="row3">' +
      App.field('日 VIP 所需积分', App.input('gDay', g.group_points_day || 10, '', 'number')) +
      App.field('周 VIP 所需积分', App.input('gWeek', g.group_points_week || 50, '', 'number')) +
      App.field('月 VIP 所需积分', App.input('gMonth', g.group_points_month || 180, '', 'number')) +
      '</div>' +
      '<div class="row2">' +
      App.field('年 VIP 所需积分', App.input('gYear', g.group_points_year || 1800, '', 'number')) +
      App.field('全站免扣点', App.select('gFree', [{ value: 0, label: '否' }, { value: 1, label: '是' }], g.group_points_free || 0)) +
      '</div>';
    App.modal('编辑会员组', body, async function () {
      var payload = {
        group_id: g.group_id || undefined, group_name: App.val('gName'),
        group_points_day: App.intVal('gDay'), group_points_week: App.intVal('gWeek'),
        group_points_month: App.intVal('gMonth'), group_points_year: App.intVal('gYear'),
        group_points_free: App.intVal('gFree')
      };
      if (!payload.group_name) { App.toast('请填写会员组名称', true); return; }
      var r = await App.req('/group/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('会员组已保存'); renderGroups(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  async function renderCards() {
    var j = await App.req('/card/list?page=1&limit=30');
    var pane = document.getElementById('userPane');
    var list = (j.data && j.data.list) || [];
    pane.innerHTML =
      '<div class="admin-card"><div class="card-head"><h3>批量生成充值卡密</h3></div>' +
      '<div class="row3">' +
      App.field('生成数量 (1-100)', App.input('cardCount', 10, '', 'number')) +
      App.field('每张充值积分', App.input('cardPoints', 100, '', 'number')) +
      App.field('每张面额 (元)', App.input('cardMoney', 10, '', 'number')) +
      '</div><button class="btn-create" id="cardGenBtn">批量生成</button>' +
      '<div id="cardGenResult" style="margin-top:.8rem"></div></div>' +
      '<div class="admin-card"><div class="card-head"><h3>卡密列表</h3></div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>ID</th><th>卡号</th><th>积分</th><th>面额</th><th>状态</th><th>使用者</th><th>生成时间</th><th>操作</th></tr></thead><tbody id="cardBody"></tbody></table></div></div>';
    var body = document.getElementById('cardBody');
    body.innerHTML = list.length ? list.map(function (c) {
      return '<tr><td>' + c.card_id + '</td><td class="code">' + App.esc(c.card_no) + '</td>' +
        '<td>' + c.card_points + '</td><td>¥' + c.card_money + '</td>' +
        '<td>' + (c.card_use_status ? '<span class="tag red">已使用</span>' : '<span class="tag green">未使用</span>') + '</td>' +
        '<td>' + App.esc(c.user_name || '-') + '</td><td>' + App.fmtTime(c.card_add_time) + '</td>' +
        '<td><button class="action-btn del" data-cid="' + c.card_id + '">删除</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">暂无卡密</td></tr>';

    document.querySelectorAll('#cardBody [data-cid]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该卡密？')) return;
        await App.req('/card/' + b.dataset.cid, { method: 'DELETE' });
        App.toast('已删除');
        renderCards();
      };
    });

    App.on('cardGenBtn', 'click', async function () {
      var r = await App.req('/card/generate', {
        method: 'POST',
        body: { count: App.intVal('cardCount'), points: App.intVal('cardPoints'), money: parseFloat(App.val('cardMoney')) || 0 }
      });
      if (r.code !== 0) { App.toast(r.msg || '生成失败', true); return; }
      var txt = r.data.map(function (c) { return c.card_no + '\t' + c.card_pwd; }).join('\n');
      document.getElementById('cardGenResult').innerHTML =
        '<div class="help-block">已生成 ' + r.data.length + ' 张卡密（明文卡密仅本次显示，请及时复制保存）：</div>' +
        '<textarea class="input-box" rows="6" id="cardPlain" readonly>' + App.esc(txt) + '</textarea>';
      App.toast('卡密生成成功');
    });
  }

  // ---------------- 留言与报错 ----------------
  Views.gbook = function (host) {
    host.innerHTML = '<div class="admin-card"><div class="card-head"><h3>求片留言与播放故障报错</h3>' +
      '<button class="action-btn" id="gbookRefresh">刷新</button></div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>类型</th><th>昵称</th><th>关联影片 / 线路</th><th>内容</th><th>回复</th><th>时间</th><th>操作</th>' +
      '</tr></thead><tbody id="gbookBody"></tbody></table></div><div id="gbookPager"></div></div>';
    App.on('gbookRefresh', 'click', function () { loadGbook(1); });
    loadGbook(1);
  };

  async function loadGbook(page) {
    var j = await App.req('/gbook/list?page=' + page + '&limit=20');
    var body = document.getElementById('gbookBody');
    if (!body) return;
    var list = (j.data && j.data.list) || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">暂无留言反馈</td></tr>'; return; }
    body.innerHTML = list.map(function (g) {
      var typeTag = g.vod_name ? '<span class="tag red">播放报错</span>' : '<span class="tag">求片留言</span>';
      return '<tr><td>' + g.gbook_id + '</td><td>' + typeTag + '</td><td>' + App.esc(g.gbook_name) + '</td>' +
        '<td>' + (g.vod_name ? '<b>' + App.esc(g.vod_name) + '</b><div class="muted">' + App.esc(g.play_from) + ' / ' + App.esc(g.play_part) + '</div>' : '-') + '</td>' +
        '<td style="max-width:260px">' + App.esc(g.gbook_content) + '</td>' +
        '<td style="max-width:200px">' + (g.gbook_reply ? App.esc(g.gbook_reply) : '<span class="muted">未回复</span>') + '</td>' +
        '<td>' + App.fmtTime(g.gbook_time) + '</td>' +
        '<td><button class="action-btn" data-reply="' + g.gbook_id + '">回复</button> ' +
        '<button class="action-btn del" data-del="' + g.gbook_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#gbookBody [data-reply]').forEach(function (b) {
      b.onclick = function () {
        var g = list.find(function (x) { return x.gbook_id === parseInt(b.dataset.reply, 10); });
        App.modal('回复留言 #' + g.gbook_id,
          '<div class="help-block" style="margin-bottom:.6rem">用户内容：' + App.esc(g.gbook_content) + '</div>' +
          App.field('管理员回复', App.textarea('gbReply', g.gbook_reply, 4)),
          async function () {
            var r = await App.req('/gbook/reply', { method: 'POST', body: { id: g.gbook_id, reply: App.val('gbReply') } });
            if (r.code === 0) { App.closeModal(); App.toast('回复成功'); loadGbook(page); }
            else App.toast(r.msg || '回复失败', true);
          }, '提交回复');
      };
    });
    document.querySelectorAll('#gbookBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该条反馈？')) return;
        await App.req('/gbook/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadGbook(page);
      };
    });
    document.getElementById('gbookPager').innerHTML = App.pager(j.data, loadGbook);
  }

  // ---------------- 评论 ----------------
  Views.comment = function (host) {
    host.innerHTML = '<div class="admin-card"><div class="card-head"><h3>全站评论管理</h3>' +
      '<button class="action-btn" id="cmtRefresh">刷新</button></div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>模块</th><th>关联内容</th><th>昵称</th><th>评论内容</th><th>时间</th><th>操作</th>' +
      '</tr></thead><tbody id="cmtBody"></tbody></table></div></div>';
    App.on('cmtRefresh', 'click', loadComments);
    loadComments();
  };

  async function loadComments() {
    var j = await App.req('/comment/list');
    var body = document.getElementById('cmtBody');
    if (!body) return;
    var list = j.data || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="7" class="empty">暂无评论</td></tr>'; return; }
    var mids = { 1: '视频', 2: '文章', 3: '专题' };
    body.innerHTML = list.map(function (c) {
      return '<tr><td>' + c.comment_id + '</td><td><span class="tag">' + (mids[c.comment_mid] || c.comment_mid) + '</span></td>' +
        '<td>' + App.esc(c.target_name || ('ID ' + c.comment_rid)) + '</td>' +
        '<td>' + App.esc(c.comment_name) + '</td>' +
        '<td style="max-width:320px">' + App.esc(c.comment_content) + '</td>' +
        '<td>' + App.fmtTime(c.comment_time) + '</td>' +
        '<td><button class="action-btn del" data-del="' + c.comment_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#cmtBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该评论？')) return;
        await App.req('/comment/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadComments();
      };
    });
  }
})(window);