// ========================================================
// 后台视图：分类 / 文章 / 专题 / 明星角色
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  // ---------------- 分类体系 ----------------
  Views.type = async function (host) {
    host.innerHTML =
      '<div class="toolbar"><button class="btn-create" id="typeAddBtn">+ 新增分类</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>排序</th><th>分类名称</th><th>拼音</th><th>模型</th><th>层级</th><th>状态</th><th>操作</th>' +
      '</tr></thead><tbody id="typeBody"></tbody></table></div></div>';
    App.on('typeAddBtn', 'click', function () { openTypeModal(null); });
    await loadTypeTable();
  };

  async function loadTypeTable() {
    await App.loadTypes();
    var j = await App.req('/type/list');
    var body = document.getElementById('typeBody');
    if (!body) return;
    var mids = { 1: '视频', 2: '文章', 3: '专题', 8: '明星', 9: '角色', 11: '网址' };
    var list = j.data || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">暂无分类</td></tr>'; return; }
    body.innerHTML = list.map(function (t) {
      return '<tr><td>' + t.type_id + '</td><td>' + t.type_sort + '</td>' +
        '<td><b>' + (t.type_pid > 0 ? '└ ' : '') + App.esc(t.type_name) + '</b></td>' +
        '<td class="code">' + App.esc(t.type_en) + '</td>' +
        '<td><span class="tag">' + (mids[t.type_mid] || t.type_mid) + '</span></td>' +
        '<td>' + (t.type_pid === 0 ? '一级根分类' : '子分类 (父ID: ' + t.type_pid + ')') + '</td>' +
        '<td>' + (t.type_status ? '<span class="tag green">启用</span>' : '<span class="tag red">停用</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + t.type_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + t.type_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#typeBody [data-edit]').forEach(function (b) {
      b.onclick = function () {
        var t = list.find(function (x) { return x.type_id === parseInt(b.dataset.edit, 10); });
        openTypeModal(t);
      };
    });
    document.querySelectorAll('#typeBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该分类？')) return;
        await App.req('/type/' + b.dataset.del, { method: 'DELETE' });
        App.toast('分类已删除');
        loadTypeTable();
      };
    });
  }

  function openTypeModal(t) {
    t = t || {};
    var options = App.types.map(function (x) {
      return { value: x.type_id, label: (x.type_pid > 0 ? '└ ' : '') + x.type_name };
    });
    var body =
      '<div class="row3">' +
      App.field('分类名称 *', App.input('tName', t.type_name)) +
      App.field('拼音别名', App.input('tEn', t.type_en)) +
      App.field('排序', App.input('tSort', t.type_sort || 0, '', 'number')) +
      '</div>' +
      '<div class="row3">' +
      App.field('内容模型', App.select('tMid', [{ value: 1, label: '视频 vod' }, { value: 2, label: '文章 art' }, { value: 3, label: '专题 topic' }, { value: 8, label: '明星 actor' }, { value: 9, label: '角色 role' }, { value: 11, label: '网址 website' }], t.type_mid || 1)) +
      App.field('父级分类', App.select('tPid', options, t.type_pid || 0, '无（一级根分类）')) +
      App.field('状态', App.select('tStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], t.type_status === 0 ? 0 : 1)) +
      '</div>' +
      '<div class="row2">' +
      App.field('SEO 标题', App.input('tTitle', t.type_title)) +
      App.field('SEO 关键词', App.input('tKey', t.type_key)) +
      '</div>' +
      App.field('SEO 描述', App.textarea('tDes', t.type_des, 2)) +
      '<div class="row2">' +
      App.field('分类 Logo', App.input('tLogo', t.type_logo)) +
      App.field('分类 Banner 图', App.input('tPic', t.type_pic)) +
      '</div>' +
      '<div class="row3">' +
      App.field('列表模板', App.input('tTplList', t.type_tpl_list)) +
      App.field('详情模板', App.input('tTplDetail', t.type_tpl_detail)) +
      App.field('播放模板', App.input('tTplPlay', t.type_tpl_play)) +
      '</div>' +
      App.field('扩展筛选 (JSON)', App.textarea('tExtend', t.type_extend, 2));

    App.modal(t.type_id ? '编辑分类 #' + t.type_id : '新增分类', body, async function () {
      var payload = {
        type_id: t.type_id || undefined,
        type_name: App.val('tName'), type_en: App.val('tEn'), type_sort: App.intVal('tSort'),
        type_mid: App.intVal('tMid'), type_pid: App.intVal('tPid'), type_status: App.intVal('tStatus'),
        type_title: App.val('tTitle'), type_key: App.val('tKey'), type_des: App.val('tDes'),
        type_logo: App.val('tLogo'), type_pic: App.val('tPic'),
        type_tpl_list: App.val('tTplList'), type_tpl_detail: App.val('tTplDetail'), type_tpl_play: App.val('tTplPlay'),
        type_extend: App.val('tExtend')
      };
      if (!payload.type_name) { App.toast('请填写分类名称', true); return; }
      var r = await App.req('/type/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('分类已保存'); loadTypeTable(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  // ---------------- 文章资讯 ----------------
  Views.art = function (host) {
    host.innerHTML =
      '<div class="toolbar"><input class="input-box" id="artKw" placeholder="搜索文章标题" style="max-width:240px">' +
      '<button class="action-btn" id="artSearchBtn">搜索</button>' +
      '<button class="btn-create" id="artAddBtn">+ 发布文章</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>标题</th><th>分类</th><th>作者 / 来源</th><th>点击</th><th>发布时间</th><th>操作</th>' +
      '</tr></thead><tbody id="artBody"></tbody></table></div><div id="artPager"></div></div>';
    App.on('artSearchBtn', 'click', function () { loadArtTable(1); });
    App.on('artAddBtn', 'click', function () { openArtModal(null); });
    loadArtTable(1);
  };

  async function loadArtTable(page) {
    var body = document.getElementById('artBody');
    body.innerHTML = '<tr><td colspan="7" class="empty">载入中…</td></tr>';
    var q = '?page=' + page + '&limit=15';
    var kw = App.val('artKw');
    if (kw) q += '&wd=' + encodeURIComponent(kw);
    var j = await App.req('/art/list' + q);
    if (j.code !== 0) { body.innerHTML = '<tr><td colspan="7" class="empty">加载失败</td></tr>'; return; }
    var list = j.data.list || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="7" class="empty">暂无文章</td></tr>'; return; }
    body.innerHTML = list.map(function (a) {
      return '<tr><td>' + a.art_id + '</td><td><b>' + App.esc(a.art_name) + '</b></td>' +
        '<td><span class="tag">' + App.esc(a.type_name || a.type_id) + '</span></td>' +
        '<td>' + App.esc(a.art_author) + ' / ' + App.esc(a.art_from) + '</td>' +
        '<td>' + a.art_hits + '</td><td>' + App.fmtTime(a.art_time) + '</td>' +
        '<td><button class="action-btn" data-edit="' + a.art_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + a.art_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#artBody [data-edit]').forEach(function (b) {
      b.onclick = function () { openArtModal(parseInt(b.dataset.edit, 10)); };
    });
    document.querySelectorAll('#artBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该文章？')) return;
        await App.req('/art/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadArtTable(page);
      };
    });
    document.getElementById('artPager').innerHTML = App.pager(j.data, function (p) { loadArtTable(p); });
  }

  async function openArtModal(id) {
    var a = {};
    if (id) {
      var j = await App.req('/art/' + id);
      if (j.code === 0) a = j.data;
    }
    var artTypes = App.types.filter(function (t) { return t.type_mid === 2; });
    var body =
      '<div class="row2">' +
      App.field('文章标题 *', App.input('aName', a.art_name)) +
      App.field('所属分类', App.select('aType', artTypes.map(function (t) { return { value: t.type_id, label: t.type_name }; }), a.type_id)) +
      '</div>' +
      '<div class="row3">' +
      App.field('作者', App.input('aAuthor', a.art_author || '官方编辑')) +
      App.field('来源', App.input('aFrom', a.art_from || '本站原创')) +
      App.field('状态', App.select('aStatus', [{ value: 1, label: '已发布' }, { value: 0, label: '草稿' }], a.art_status === 0 ? 0 : 1)) +
      '</div>' +
      App.field('封面图 URL', App.input('aPic', a.art_pic)) +
      App.field('简介', App.textarea('aBlurb', a.art_blurb, 2)) +
      App.field('正文内容 (HTML)', App.textarea('aContent', a.art_content, 8)) +
      App.field('关联影片 ID (逗号分隔)', App.input('aRelVod', a.art_rel_vod));

    App.modal(id ? '编辑文章 #' + id : '发布文章', body, async function () {
      var payload = {
        art_id: id || undefined,
        art_name: App.val('aName'), type_id: App.intVal('aType'),
        art_author: App.val('aAuthor'), art_from: App.val('aFrom'),
        art_status: App.intVal('aStatus'), art_pic: App.val('aPic'),
        art_blurb: App.val('aBlurb'), art_content: App.val('aContent'), art_rel_vod: App.val('aRelVod')
      };
      if (!payload.art_name) { App.toast('请填写文章标题', true); return; }
      var r = await App.req('/art/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('文章已保存'); loadArtTable(1); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  // ---------------- 影视专题 ----------------
  Views.topic = function (host) {
    host.innerHTML =
      '<div class="toolbar"><button class="btn-create" id="topicAddBtn">+ 创建专题</button></div>' +
      '<div class="admin-card"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>专题名称</th><th>关联影片 IDs</th><th>点击</th><th>排序</th><th>操作</th>' +
      '</tr></thead><tbody id="topicBody"></tbody></table></div>';
    App.on('topicAddBtn', 'click', function () { openTopicModal(null); });
    loadTopicTable();
  };

  async function loadTopicTable() {
    var j = await App.req('/topic/list');
    var body = document.getElementById('topicBody');
    if (!body) return;
    var list = j.data || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty">暂无专题</td></tr>'; return; }
    body.innerHTML = list.map(function (t) {
      return '<tr><td>' + t.topic_id + '</td><td><b>' + App.esc(t.topic_name) + '</b></td>' +
        '<td class="code">' + App.esc(t.topic_rel_vod) + '</td><td>' + t.topic_hits + '</td><td>' + t.topic_sort + '</td>' +
        '<td><button class="action-btn" data-edit="' + t.topic_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + t.topic_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#topicBody [data-edit]').forEach(function (b) {
      b.onclick = function () {
        var t = list.find(function (x) { return x.topic_id === parseInt(b.dataset.edit, 10); });
        openTopicModal(t);
      };
    });
    document.querySelectorAll('#topicBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该专题？')) return;
        await App.req('/topic/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadTopicTable();
      };
    });
  }

  function openTopicModal(t) {
    t = t || {};
    var body =
      '<div class="row2">' +
      App.field('专题名称 *', App.input('tpName', t.topic_name)) +
      App.field('拼音别名', App.input('tpEn', t.topic_en)) +
      '</div>' +
      '<div class="row3">' +
      App.field('排序', App.input('tpSort', t.topic_sort || 0, '', 'number')) +
      App.field('状态', App.select('tpStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], t.topic_status === 0 ? 0 : 1)) +
      App.field('推荐星级', App.input('tpLevel', t.topic_level || 0, '', 'number')) +
      '</div>' +
      App.field('封面图 URL', App.input('tpPic', t.topic_pic)) +
      App.field('专题简介', App.textarea('tpBlurb', t.topic_blurb, 2)) +
      App.field('专题详情内容 (HTML)', App.textarea('tpContent', t.topic_content, 6)) +
      App.field('关联影片 ID (逗号分隔)', App.input('tpRelVod', t.topic_rel_vod)) +
      App.field('关联文章 ID (逗号分隔)', App.input('tpRelArt', t.topic_rel_art));

    App.modal(t.topic_id ? '编辑专题 #' + t.topic_id : '创建专题', body, async function () {
      var payload = {
        topic_id: t.topic_id || undefined,
        topic_name: App.val('tpName'), topic_en: App.val('tpEn'),
        topic_sort: App.intVal('tpSort'), topic_status: App.intVal('tpStatus'), topic_level: App.intVal('tpLevel'),
        topic_pic: App.val('tpPic'), topic_blurb: App.val('tpBlurb'), topic_content: App.val('tpContent'),
        topic_rel_vod: App.val('tpRelVod'), topic_rel_art: App.val('tpRelArt')
      };
      if (!payload.topic_name) { App.toast('请填写专题名称', true); return; }
      var r = await App.req('/topic/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('专题已保存'); loadTopicTable(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  // ---------------- 明星与角色 ----------------
  Views.actor = function (host) {
    host.innerHTML =
      '<div class="tabs-line" id="actorTabs"><a class="active" data-tab="actors">明星演员库</a><a data-tab="roles">影视角色库</a></div>' +
      '<div id="actorPane"></div>';
    document.querySelectorAll('#actorTabs a').forEach(function (a) {
      a.onclick = function () {
        document.querySelectorAll('#actorTabs a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        if (a.dataset.tab === 'actors') renderActors();
        else renderRoles();
      };
    });
    renderActors();
  };

  async function renderActors() {
    var pane = document.getElementById('actorPane');
    pane.innerHTML = '<div class="toolbar"><button class="btn-create" id="actorAddBtn">+ 新增明星</button></div>' +
      '<div class="admin-card"><table class="data-table"><thead><tr><th>ID</th><th>姓名</th><th>英文名</th><th>性别</th><th>地区</th><th>代表作</th><th>点击</th><th>操作</th></tr></thead><tbody id="actorBody"></tbody></table></div>';
    App.on('actorAddBtn', 'click', function () { openActorModal(null); });
    var j = await App.req('/actor/list?page=1&limit=50');
    var body = document.getElementById('actorBody');
    if (!body) return;
    var list = (j.data && j.data.list) || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">暂无明星数据</td></tr>'; return; }
    body.innerHTML = list.map(function (a) {
      return '<tr><td>' + a.actor_id + '</td><td><b>' + App.esc(a.actor_name) + '</b></td>' +
        '<td>' + App.esc(a.actor_en) + '</td><td>' + App.esc(a.actor_sex) + '</td><td>' + App.esc(a.actor_area) + '</td>' +
        '<td class="muted">' + App.esc(a.actor_works) + '</td><td>' + a.actor_hits + '</td>' +
        '<td><button class="action-btn" data-edit="' + a.actor_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + a.actor_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#actorBody [data-edit]').forEach(function (b) {
      b.onclick = async function () {
        var r = await App.req('/actor/' + b.dataset.edit);
        openActorModal(r.code === 0 ? r.data : null);
      };
    });
    document.querySelectorAll('#actorBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该明星？')) return;
        await App.req('/actor/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        renderActors();
      };
    });
  }

  function openActorModal(a) {
    a = a || {};
    var actorTypes = App.types.filter(function (t) { return t.type_mid === 8; });
    var body =
      '<div class="row3">' +
      App.field('姓名 *', App.input('acName', a.actor_name)) +
      App.field('英文名', App.input('acEn', a.actor_en)) +
      App.field('性别', App.select('acSex', [{ value: '男', label: '男' }, { value: '女', label: '女' }], a.actor_sex || '男')) +
      '</div>' +
      '<div class="row3">' +
      App.field('分类', App.select('acType', actorTypes.map(function (t) { return { value: t.type_id, label: t.type_name }; }), a.type_id)) +
      App.field('地区', App.input('acArea', a.actor_area)) +
      App.field('生日', App.input('acBirthday', a.actor_birthday)) +
      '</div>' +
      '<div class="row3">' +
      App.field('身高', App.input('acHeight', a.actor_height)) +
      App.field('星座', App.input('acStarsign', a.actor_starsign)) +
      App.field('毕业院校', App.input('acSchool', a.actor_school)) +
      '</div>' +
      App.field('头像 URL', App.input('acPic', a.actor_pic)) +
      App.field('代表作', App.input('acWorks', a.actor_works)) +
      App.field('一句话简介', App.textarea('acBlurb', a.actor_blurb, 2)) +
      App.field('生平详情 (HTML)', App.textarea('acContent', a.actor_content, 5));

    App.modal(a.actor_id ? '编辑明星 #' + a.actor_id : '新增明星', body, async function () {
      var payload = {
        actor_id: a.actor_id || undefined,
        actor_name: App.val('acName'), actor_en: App.val('acEn'), actor_sex: App.val('acSex'),
        type_id: App.intVal('acType'), actor_area: App.val('acArea'), actor_birthday: App.val('acBirthday'),
        actor_height: App.val('acHeight'), actor_starsign: App.val('acStarsign'), actor_school: App.val('acSchool'),
        actor_pic: App.val('acPic'), actor_works: App.val('acWorks'),
        actor_blurb: App.val('acBlurb'), actor_content: App.val('acContent')
      };
      if (!payload.actor_name) { App.toast('请填写明星姓名', true); return; }
      var r = await App.req('/actor/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('明星信息已保存'); renderActors(); }
      else App.toast(r.msg || '保存失败', true);
    });
  }

  async function renderRoles() {
    var pane = document.getElementById('actorPane');
    pane.innerHTML = '<div class="toolbar"><button class="btn-create" id="roleAddBtn">+ 新增角色</button></div>' +
      '<div class="admin-card"><table class="data-table"><thead><tr><th>ID</th><th>角色名</th><th>饰演明星</th><th>所属影片</th><th>备注</th><th>操作</th></tr></thead><tbody id="roleBody"></tbody></table></div>';
    App.on('roleAddBtn', 'click', function () { openRoleModal(null); });
    var j = await App.req('/role/list?page=1&limit=50');
    var body = document.getElementById('roleBody');
    if (!body) return;
    var list = (j.data && j.data.list) || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="empty">暂无角色数据</td></tr>'; return; }
    body.innerHTML = list.map(function (r) {
      return '<tr><td>' + r.role_id + '</td><td><b>' + App.esc(r.role_name) + '</b></td>' +
        '<td>' + App.esc(r.role_actor_name) + '</td><td>' + App.esc(r.role_vod_name) + '</td>' +
        '<td class="muted">' + App.esc(r.role_remarks) + '</td>' +
        '<td><button class="action-btn" data-edit="' + r.role_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + r.role_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('#roleBody [data-edit]').forEach(function (b) {
      b.onclick = function () {
        var r = list.find(function (x) { return x.role_id === parseInt(b.dataset.edit, 10); });
        openRoleModal(r);
      };
    });
    document.querySelectorAll('#roleBody [data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该角色？')) return;
        await App.req('/role/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        renderRoles();
      };
    });
  }

  function openRoleModal(r) {
    r = r || {};
    var body =
      '<div class="row2">' +
      App.field('角色名称 *', App.input('roName', r.role_name)) +
      App.field('角色英文名', App.input('roEn', r.role_en)) +
      '</div>' +
      '<div class="row3">' +
      App.field('饰演明星姓名', App.input('roActorName', r.role_actor_name)) +
      App.field('明星 ID', App.input('roActorId', r.role_actor_id || 0, '', 'number')) +
      App.field('所属影片 ID', App.input('roVodId', r.role_vod_id || 0, '', 'number')) +
      '</div>' +
      App.field('所属影片名称', App.input('roVodName', r.role_vod_name)) +
      App.field('角色海报 URL', App.input('roPic', r.role_pic)) +
      App.field('角色简介', App.textarea('roRemarks', r.role_remarks, 2)) +
      App.field('角色详情 (HTML)', App.textarea('roContent', r.role_content, 5));

    App.modal(r.role_id ? '编辑角色 #' + r.role_id : '新增角色', body, async function () {
      var payload = {
        role_id: r.role_id || undefined,
        role_name: App.val('roName'), role_en: App.val('roEn'),
        role_actor_name: App.val('roActorName'), role_actor_id: App.intVal('roActorId'),
        role_vod_name: App.val('roVodName'), role_vod_id: App.intVal('roVodId'),
        role_pic: App.val('roPic'), role_remarks: App.val('roRemarks'), role_content: App.val('roContent')
      };
      if (!payload.role_name) { App.toast('请填写角色名称', true); return; }
      var res = await App.req('/role/save', { method: 'POST', body: payload });
      if (res.code === 0) { App.closeModal(); App.toast('角色已保存'); renderRoles(); }
      else App.toast(res.msg || '保存失败', true);
    });
  }
})(window);