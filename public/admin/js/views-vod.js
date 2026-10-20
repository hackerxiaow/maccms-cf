// ========================================================
// 后台视图：运行概览 / 视频管理 / 批量运维
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  Views.overview = async function (host) {
    var j = await App.req('/overview');
    var d = (j && j.data) || {};
    host.innerHTML =
      '<div class="metric-grid">' +
      '<div class="metric-card"><span>影视影片</span><div class="metric-num">' + (d.total_vod || 0) + '</div></div>' +
      '<div class="metric-card"><span>分类总数</span><div class="metric-num" style="color:#38bdf8">' + (d.total_type || 0) + '</div></div>' +
      '<div class="metric-card"><span>文章资讯</span><div class="metric-num" style="color:#4ade80">' + (d.total_art || 0) + '</div></div>' +
      '<div class="metric-card"><span>影视专题</span><div class="metric-num" style="color:#facc15">' + (d.total_topic || 0) + '</div></div>' +
      '<div class="metric-card"><span>明星演员</span><div class="metric-num" style="color:#a78bfa">' + (d.total_actor || 0) + '</div></div>' +
      '<div class="metric-card"><span>注册会员</span><div class="metric-num" style="color:#f472b6">' + (d.total_user || 0) + '</div></div>' +
      '<div class="metric-card"><span>待处理反馈</span><div class="metric-num" style="color:#fb923c">' + (d.total_gbook || 0) + '</div></div>' +
      '<div class="metric-card"><span>今日更新</span><div class="metric-num" style="color:#4ade80">' + (d.today_updated || 0) + '</div></div>' +
      '</div>' +
      '<div class="admin-card"><div class="card-head"><h3>开放标准协议地址</h3></div>' +
      '<div class="help-block">' +
      '<p>• 视频提供接口：<span class="code">/api.php/provide/vod/?ac=list</span> 或 <span class="code">?ac=videolist&h=24</span>（追加 <span class="code">&at=xml</span> 输出 RSS 5.1）</p>' +
      '<p>• 文章提供接口：<span class="code">/api.php/provide/art/?ac=list</span></p>' +
      '<p>• 明星/角色接口：<span class="code">/api.php/provide/actor/</span>、<span class="code">/api.php/provide/role/</span></p>' +
      '<p>• v8 经典兼容：<span class="code">/inc/api.php</span>、<span class="code">/inc/apijson.php</span>、<span class="code">/inc/apixml.php</span>（支持 action / rday / play / xt 参数）</p>' +
      '<p>• 定时采集：<span class="code">/api.php/timming/index?h=24</span>（可在系统设置配置 timming_key）</p>' +
      '</div></div>';
  };

  var vodState = { page: 1, ids: [] };

  Views.vod = function (host) {
    vodState = { page: 1, ids: [] };
    host.innerHTML =
      '<div class="toolbar">' +
      '<input class="input-box" id="vodKw" placeholder="搜索片名 / 演员 / 导演" style="max-width:260px">' +
      '<button class="action-btn" id="vodSearchBtn">搜索</button>' +
      '<button class="btn-create" id="vodAddBtn">+ 新增影片</button>' +
      '</div>' +
      '<div class="admin-card">' +
      '<div class="toolbar">' +
      '<span class="muted">批量操作：</span>' +
      '<button class="action-btn" data-batch="audit1">审核通过</button>' +
      '<button class="action-btn" data-batch="audit0">取消审核</button>' +
      '<button class="action-btn" data-batch="lock1">锁定</button>' +
      '<button class="action-btn" data-batch="lock0">解锁</button>' +
      '<button class="action-btn ok" data-batch="level">设星级</button>' +
      '<button class="action-btn" data-batch="type">换分类</button>' +
      '<button class="action-btn del" data-batch="del">批量删除</button>' +
      '</div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th><input type="checkbox" class="checkbox" id="vodAll"></th><th>ID</th><th>片名</th><th>分类</th>' +
      '<th>状态</th><th>星级</th><th>锁定</th><th>播放源</th><th>更新时间</th><th>操作</th>' +
      '</tr></thead><tbody id="vodBody"><tr><td colspan="10" class="empty">载入中…</td></tr></tbody></table></div>' +
      '<div id="vodPager"></div></div>';

    App.on('vodSearchBtn', 'click', function () { vodState.page = 1; loadVodTable(); });
    App.on('vodAddBtn', 'click', function () { openVodModal(null); });
    App.on('vodAll', 'change', function () {
      document.querySelectorAll('.vod-check').forEach(function (c) { c.checked = document.getElementById('vodAll').checked; });
    });
    document.querySelectorAll('[data-batch]').forEach(function (b) {
      b.onclick = function () { doBatch(b.dataset.batch); };
    });
    loadVodTable();
  };

  async function loadVodTable() {
    var body = document.getElementById('vodBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="10" class="empty">载入中…</td></tr>';
    var q = '?page=' + vodState.page + '&limit=15';
    var kw = App.val('vodKw');
    if (kw) q += '&wd=' + encodeURIComponent(kw);
    var j = await App.req('/vod/list' + q);
    if (j.code !== 0) { body.innerHTML = '<tr><td colspan="10" class="empty">加载失败</td></tr>'; return; }
    var list = j.data.list || [];
    if (!list.length) { body.innerHTML = '<tr><td colspan="10" class="empty">暂无数据</td></tr>'; return; }
    body.innerHTML = list.map(function (v) {
      return '<tr>' +
        '<td><input type="checkbox" class="checkbox vod-check" value="' + v.vod_id + '"></td>' +
        '<td>' + v.vod_id + '</td>' +
        '<td><b>' + App.esc(v.vod_name) + '</b></td>' +
        '<td><span class="tag">' + App.esc(v.type_name || v.type_id) + '</span></td>' +
        '<td>' + (v.vod_status ? '<span class="tag green">已审</span>' : '<span class="tag red">未审</span>') +
        (v.vod_isend ? ' <span class="tag gold">完结</span>' : '') + '</td>' +
        '<td>' + (v.vod_level || 0) + '</td>' +
        '<td>' + (v.vod_lock ? '<span class="tag red">锁定</span>' : '<span class="tag">正常</span>') + '</td>' +
        '<td class="code">' + App.esc((v.vod_play_from || '').replace(/\$\$\$/g, ' | ')) + '</td>' +
        '<td>' + App.fmtTime(v.vod_time) + '</td>' +
        '<td><button class="action-btn" data-edit="' + v.vod_id + '">编辑</button> ' +
        '<button class="action-btn del" data-del="' + v.vod_id + '">删除</button></td></tr>';
    }).join('');
    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { openVodModal(parseInt(b.dataset.edit, 10)); };
    });
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('确定删除该影片？')) return;
        await App.req('/vod/' + b.dataset.del, { method: 'DELETE' });
        App.toast('已删除');
        loadVodTable();
      };
    });
    document.getElementById('vodPager').innerHTML = App.pager(j.data, function (p) { vodState.page = p; loadVodTable(); });
  }

  function selectedIds() {
    return Array.prototype.slice.call(document.querySelectorAll('.vod-check:checked')).map(function (c) { return parseInt(c.value, 10); });
  }

  async function doBatch(type) {
    var ids = selectedIds();
    if (!ids.length) { App.toast('请先勾选影片', true); return; }
    if (type === 'audit1' || type === 'audit0') {
      await App.req('/vod/batch/status', { method: 'POST', body: { ids: ids, status: type === 'audit1' ? 1 : 0 } });
    } else if (type === 'lock1' || type === 'lock0') {
      await App.req('/vod/batch/lock', { method: 'POST', body: { ids: ids, lock: type === 'lock1' ? 1 : 0 } });
    } else if (type === 'level') {
      var lv = prompt('请输入推荐星级 (0-9)', '5');
      if (lv === null) return;
      await App.req('/vod/batch/level', { method: 'POST', body: { ids: ids, level: parseInt(lv, 10) || 0 } });
    } else if (type === 'type') {
      var sel = prompt('请输入目标分类 ID', '1');
      if (sel === null) return;
      await App.req('/vod/batch/type', { method: 'POST', body: { ids: ids, type_id: parseInt(sel, 10) || 0 } });
    } else if (type === 'del') {
      if (!confirm('确定批量删除 ' + ids.length + ' 条影片？')) return;
      await App.req('/vod/batch/del', { method: 'POST', body: { ids: ids } });
    }
    App.toast('批量操作完成');
    loadVodTable();
  }

  Views._openVodModal = openVodModal;

  async function openVodModal(id) {
    var v = {};
    if (id) {
      var j = await App.req('/vod/' + id);
      if (j.code === 0) v = j.data;
    }
    var body =
      '<div class="row3">' +
      App.field('影片名称 *', App.input('vName', v.vod_name)) +
      App.field('所属分类', App.select('vType', App.typeOptions(), v.type_id)) +
      App.field('状态', App.select('vStatus', [{ value: 1, label: '已审核' }, { value: 0, label: '未审核' }], v.vod_status === 0 ? 0 : 1)) +
      '</div>' +
      '<div class="row3">' +
      App.field('副标题', App.input('vSub', v.vod_sub)) +
      App.field('拼音别名', App.input('vEn', v.vod_en)) +
      App.field('首字母', App.input('vLetter', v.vod_letter)) +
      '</div>' +
      '<div class="row3">' +
      App.field('主演', App.input('vActor', v.vod_actor)) +
      App.field('导演', App.input('vDirector', v.vod_director)) +
      App.field('编剧', App.input('vWriter', v.vod_writer)) +
      '</div>' +
      '<div class="row3">' +
      App.field('年份', App.input('vYear', v.vod_year)) +
      App.field('地区', App.input('vArea', v.vod_area)) +
      App.field('语言', App.input('vLang', v.vod_lang)) +
      '</div>' +
      '<div class="row3">' +
      App.field('版本 (4K/蓝光)', App.input('vVersion', v.vod_version)) +
      App.field('资源状态', App.input('vState', v.vod_state)) +
      App.field('连载星期 (1-7)', App.input('vWeekday', v.vod_weekday, '', 'number')) +
      '</div>' +
      '<div class="row3">' +
      App.field('备注 / 更新至', App.input('vRemarks', v.vod_remarks)) +
      App.field('总集数', App.input('vTotal', v.vod_total, '', 'number')) +
      App.field('完结状态', App.select('vIsend', [{ value: 0, label: '连载中' }, { value: 1, label: '已完结' }], v.vod_isend || 0)) +
      '</div>' +
      '<div class="row3">' +
      App.field('推荐星级 (0-9)', App.input('vLevel', v.vod_level || 0, '', 'number')) +
      App.field('数据锁定', App.select('vLock', [{ value: 0, label: '不锁定' }, { value: 1, label: '锁定(采集不覆盖)' }], v.vod_lock || 0)) +
      App.field('评分', App.input('vScore', v.vod_score || 9.0, '', 'number')) +
      '</div>' +
      App.field('主海报 URL', App.input('vPic', v.vod_pic)) +
      App.field('横版剧照 URL (巨幕背景)', App.input('vPicSlide', v.vod_pic_slide)) +
      App.field('一句话简介', App.textarea('vBlurb', v.vod_blurb, 2)) +
      App.field('剧情详细简介 (支持 HTML)', App.textarea('vContent', v.vod_content, 4)) +
      '<div class="card-head" style="margin-top:1rem"><h3>播放线路 ($$$ / # / $)</h3></div>' +
      '<div class="row2">' +
      App.field('播放源标识', App.input('vPlayFrom', v.vod_play_from, 'dplayer$$$kkm3u8')) +
      App.field('播放服务器', App.input('vPlayServer', v.vod_play_server, 'no$$$no')) +
      '</div>' +
      App.field('线路备注', App.input('vPlayNote', v.vod_play_note, '极速线路$$$备用线路')) +
      App.field('播放地址数据', App.textarea('vPlayUrl', v.vod_play_url, 4)) +
      '<div class="card-head" style="margin-top:1rem"><h3>下载线路</h3></div>' +
      '<div class="row2">' +
      App.field('下载源标识', App.input('vDownFrom', v.vod_down_from)) +
      App.field('下载服务器', App.input('vDownServer', v.vod_down_server)) +
      '</div>' +
      App.field('下载地址数据', App.textarea('vDownUrl', v.vod_down_url, 3)) +
      '<div class="card-head" style="margin-top:1rem"><h3>会员权限与关联</h3></div>' +
      '<div class="row3">' +
      App.field('最低会员组', App.input('vGroupId', v.group_id || 0, '', 'number')) +
      App.field('整片积分', App.input('vPoints', v.vod_points || 0, '', 'number')) +
      App.field('单集点播积分', App.input('vPointsPlay', v.vod_points_play || 0, '', 'number')) +
      '</div>' +
      '<div class="row3">' +
      App.field('单集下载积分', App.input('vPointsDown', v.vod_points_down || 0, '', 'number')) +
      App.field('试看分钟', App.input('vTrysee', v.vod_trysee || 0, '', 'number')) +
      App.field('豆瓣 ID', App.input('vDoubanId', v.vod_douban_id || 0, '', 'number')) +
      '</div>' +
      App.field('关联视频 ID (逗号分隔)', App.input('vRelVod', v.vod_rel_vod)) +
      App.field('关联文章 ID (逗号分隔)', App.input('vRelArt', v.vod_rel_art));

    App.modal(id ? '编辑影片 #' + id : '新增影片', body, async function () {
      var payload = {
        vod_id: id || undefined,
        vod_name: App.val('vName'),
        type_id: App.intVal('vType'),
        vod_status: App.intVal('vStatus'),
        vod_sub: App.val('vSub'), vod_en: App.val('vEn'), vod_letter: App.val('vLetter'),
        vod_actor: App.val('vActor'), vod_director: App.val('vDirector'), vod_writer: App.val('vWriter'),
        vod_year: App.val('vYear'), vod_area: App.val('vArea'), vod_lang: App.val('vLang'),
        vod_version: App.val('vVersion'), vod_state: App.val('vState'), vod_weekday: App.intVal('vWeekday'),
        vod_remarks: App.val('vRemarks'), vod_total: App.intVal('vTotal'), vod_isend: App.intVal('vIsend'),
        vod_level: App.intVal('vLevel'), vod_lock: App.intVal('vLock'), vod_score: parseFloat(App.val('vScore')) || 9.0,
        vod_pic: App.val('vPic'), vod_pic_slide: App.val('vPicSlide'),
        vod_blurb: App.val('vBlurb'), vod_content: App.val('vContent'),
        vod_play_from: App.val('vPlayFrom'), vod_play_server: App.val('vPlayServer'),
        vod_play_note: App.val('vPlayNote'), vod_play_url: App.val('vPlayUrl'),
        vod_down_from: App.val('vDownFrom'), vod_down_server: App.val('vDownServer'), vod_down_url: App.val('vDownUrl'),
        group_id: App.intVal('vGroupId'), vod_points: App.intVal('vPoints'),
        vod_points_play: App.intVal('vPointsPlay'), vod_points_down: App.intVal('vPointsDown'),
        vod_trysee: App.intVal('vTrysee'), vod_douban_id: App.intVal('vDoubanId'),
        vod_rel_vod: App.val('vRelVod'), vod_rel_art: App.val('vRelArt')
      };
      if (!payload.vod_name) { App.toast('请填写影片名称', true); return; }
      var r = await App.req('/vod/save', { method: 'POST', body: payload });
      if (r.code === 0) { App.closeModal(); App.toast('保存成功'); loadVodTable(); }
      else App.toast(r.msg || '保存失败', true);
    }, id ? '保存修改' : '创建影片');
  }

  // ---------- 批量运维 ----------
  Views.tools = function (host) {
    host.innerHTML =
      '<div class="admin-card"><div class="card-head"><h3>重名影片检测与智能合并</h3>' +
      '<button class="action-btn" id="repeatCheckBtn">扫描重名</button></div>' +
      '<div id="repeatBox"><div class="empty">点击扫描，查找同名重复影片</div></div></div>' +
      '<div class="admin-card"><div class="card-head"><h3>数据库全局字符替换</h3></div>' +
      '<div class="help-block" style="margin-bottom:.8rem">用于更换 CDN 域名、图床地址或批量修正播放源。仅允许白名单表与字段。</div>' +
      '<div class="row3">' +
      App.field('目标表', App.select('rpTable', [{ value: 'vod', label: 'vod 视频' }, { value: 'art', label: 'art 文章' }, { value: 'topic', label: 'topic 专题' }, { value: 'actor', label: 'actor 明星' }, { value: 'role', label: 'role 角色' }, { value: 'player', label: 'player 播放器' }], 'vod')) +
      App.field('目标字段', App.select('rpCol', [{ value: 'vod_pic', label: 'vod_pic' }, { value: 'vod_play_url', label: 'vod_play_url' }, { value: 'vod_content', label: 'vod_content' }, { value: 'vod_actor', label: 'vod_actor' }], 'vod_pic')) +
      '</div>' +
      '<div class="row2">' +
      App.field('查找原字符串', App.input('rpSearch', '', '例如 old-cdn.com')) +
      App.field('替换为新字符串', App.input('rpReplace', '', '例如 new-cdn.com')) +
      '</div><button class="btn-create" id="rpRunBtn">执行全局替换</button></div>';

    App.on('rpTable', 'change', function () {
      var map = {
        vod: ['vod_pic', 'vod_play_url', 'vod_content', 'vod_actor', 'vod_director', 'vod_name', 'vod_pic_slide'],
        art: ['art_pic', 'art_content', 'art_name'],
        topic: ['topic_pic', 'topic_content', 'topic_name'],
        actor: ['actor_pic', 'actor_content', 'actor_name'],
        role: ['role_pic', 'role_content', 'role_name'],
        player: ['parse_url', 'player_parse2']
      };
      var cols = map[App.val('rpTable')] || [];
      document.getElementById('rpCol').innerHTML = cols.map(function (c) {
        return '<option value="' + c + '">' + c + '</option>';
      }).join('');
    });

    App.on('repeatCheckBtn', 'click', async function () {
      var box = document.getElementById('repeatBox');
      box.innerHTML = '<div class="empty">正在扫描…</div>';
      var j = await App.req('/vod/repeat/check');
      if (j.code !== 0) { box.innerHTML = '<div class="empty">扫描失败</div>'; return; }
      if (!j.data.length) { box.innerHTML = '<div class="empty">未发现重名影片，数据非常干净</div>'; return; }
      box.innerHTML = j.data.map(function (r, i) {
        return '<div style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:.7rem;margin-bottom:.6rem">' +
          '<div><b>' + App.esc(r.name) + '</b> <span class="tag red">' + r.count + ' 条重复</span> ' +
          '<span class="muted">IDs: ' + r.ids.join(', ') + '</span></div>' +
          '<div style="margin-top:.4rem"><label class="muted">保留主记录 ID：</label> ' +
          '<input class="input-box" id="master_' + i + '" style="max-width:120px;display:inline-block" value="' + r.ids[0] + '"> ' +
          '<button class="action-btn" data-merge="' + i + '" data-ids="' + r.ids.join(',') + '">合并其余记录</button></div></div>';
      }).join('');
      document.querySelectorAll('[data-merge]').forEach(function (b) {
        b.onclick = async function () {
          var idx = b.dataset.merge;
          var master = parseInt(App.val('master_' + idx), 10);
          var all = b.dataset.ids.split(',').map(Number);
          var targets = all.filter(function (x) { return x !== master; });
          if (!confirm('将 ' + targets.length + ' 条重复记录的播放线路合并到 ID ' + master + '，并删除重复记录？')) return;
          var r = await App.req('/vod/repeat/merge', { method: 'POST', body: { master_id: master, target_ids: targets } });
          App.toast(r.msg || '合并完成');
          document.getElementById('repeatCheckBtn').click();
        };
      });
    });

    App.on('rpRunBtn', 'click', async function () {
      var search = App.val('rpSearch');
      if (!search) { App.toast('请输入查找字符串', true); return; }
      if (!confirm('确定对全库执行替换操作？此操作不可撤销。')) return;
      var r = await App.req('/database/replace', {
        method: 'POST',
        body: { table: App.val('rpTable'), column: App.val('rpCol'), search: search, replace: App.val('rpReplace') }
      });
      App.toast(r.msg || (r.code === 0 ? '替换完成' : '替换失败'), r.code !== 0);
    });
  };
})(window);