// MacCMS10 运营扩展：直播、分析、操作审计、D1 维护与搜索引擎推送
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};

  Views.live = function (host) {
    host.innerHTML = '<div class="tabs-line" id="liveTabs"><a class="active" data-tab="channels">直播频道</a><a data-tab="categories">直播分类</a></div><div id="livePane"></div>';
    document.querySelectorAll('#liveTabs a').forEach(function (tab) {
      tab.onclick = function () {
        document.querySelectorAll('#liveTabs a').forEach(function (item) { item.classList.remove('active'); });
        tab.classList.add('active');
        if (tab.dataset.tab === 'channels') renderLiveChannels(1);
        else renderLiveCategories();
      };
    });
    renderLiveChannels(1);
  };

  async function renderLiveChannels(page) {
    page = page || 1;
    var pane = document.getElementById('livePane');
    if (!pane) return;
    var categories = await App.req('/live/categories');
    var options = [{ value: 0, label: '全部分类' }].concat((categories.data || []).map(function (item) {
      return { value: item.live_category_id, label: item.live_category_name };
    }));
    pane.innerHTML = '<div class="toolbar"><input class="input-box" id="liveKw" placeholder="频道名称 / 播放地址" style="max-width:250px">' +
      App.select('liveCategoryFilter', options, 0) + '<button class="action-btn" id="liveSearch">筛选</button>' +
      '<button class="btn-create" id="liveAdd">+ 新增频道</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th>ID</th><th>频道</th><th>分类</th><th>播放地址</th><th>排序</th><th>状态</th><th>操作</th></tr></thead><tbody id="liveRows"></tbody></table></div><div id="livePager"></div></div>';
    App.on('liveSearch', 'click', function () { renderLiveChannels(1); });
    App.on('liveAdd', 'click', function () { openLiveModal(null, categories.data || []); });
    var keyword = App.val('liveKw');
    var categoryId = App.val('liveCategoryFilter');
    var query = '?page=' + page + '&limit=20&wd=' + encodeURIComponent(keyword);
    if (categoryId && categoryId !== '0') query += '&category_id=' + categoryId;
    var result = await App.req('/live/list' + query);
    var rows = (result.data && result.data.list) || [];
    document.getElementById('liveRows').innerHTML = rows.length ? rows.map(function (item) {
      return '<tr><td>' + item.live_id + '</td><td><b>' + App.esc(item.live_name) + '</b></td>' +
        '<td>' + App.esc(item.live_category_name || '未分类') + '</td><td class="code" style="max-width:300px">' + App.esc(item.live_url) + '</td>' +
        '<td>' + item.live_sort + '</td><td>' + (item.live_status ? '<span class="tag green">启用</span>' : '<span class="tag red">停用</span>') + '</td>' +
        '<td><button class="action-btn" data-edit="' + item.live_id + '">编辑</button> <button class="action-btn del" data-del="' + item.live_id + '">删除</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">暂无直播频道</td></tr>';
    document.querySelectorAll('#liveRows [data-edit]').forEach(function (button) {
      button.onclick = function () { openLiveModal(rows.find(function (x) { return x.live_id === Number(button.dataset.edit); }), categories.data || []); };
    });
    document.querySelectorAll('#liveRows [data-del]').forEach(function (button) {
      button.onclick = async function () {
        if (!confirm('确定删除这个直播频道？')) return;
        var deleted = await App.req('/live/' + button.dataset.del, { method: 'DELETE' });
        App.toast(deleted.msg || '频道已删除');
        renderLiveChannels(page);
      };
    });
    document.getElementById('livePager').innerHTML = App.pager(result.data, renderLiveChannels);
  }

  function openLiveModal(item, categories) {
    item = item || {};
    var categoryOptions = [{ value: 0, label: '未分类' }].concat(categories.map(function (category) {
      return { value: category.live_category_id, label: category.live_category_name };
    }));
    var body = '<div class="row2">' + App.field('频道名称 *', App.input('liveName', item.live_name)) +
      App.field('播放地址 *', App.input('liveUrl', item.live_url, 'https://example.com/live.m3u8')) + '</div>' +
      '<div class="row3">' + App.field('频道分类', App.select('liveCategory', categoryOptions, item.live_category_id || 0)) +
      App.field('Logo 图片地址', App.input('liveLogo', item.live_logo)) + App.field('排序', App.input('liveSort', item.live_sort || 0, '', 'number')) + '</div>' +
      App.field('频道说明', App.textarea('liveDesc', item.live_desc, 3)) +
      App.field('状态', App.select('liveStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], item.live_status === 0 ? 0 : 1));
    App.modal(item.live_id ? '编辑直播频道 #' + item.live_id : '新增直播频道', body, async function () {
      var payload = { live_id: item.live_id || undefined, live_name: App.val('liveName'), live_url: App.val('liveUrl'),
        live_category_id: App.intVal('liveCategory'), live_logo: App.val('liveLogo'), live_sort: App.intVal('liveSort'),
        live_desc: App.val('liveDesc'), live_status: App.intVal('liveStatus') };
      var result = await App.req('/live/save', { method: 'POST', body: payload });
      if (result.code === 0) { App.closeModal(); App.toast(result.msg); renderLiveChannels(1); }
      else App.toast(result.msg || '保存失败', true);
    });
  }

  async function renderLiveCategories() {
    var pane = document.getElementById('livePane');
    var result = await App.req('/live/categories');
    var rows = result.data || [];
    pane.innerHTML = '<div class="toolbar"><button class="btn-create" id="liveCategoryAdd">+ 新增直播分类</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>ID</th><th>分类名称</th><th>排序</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (item) { return '<tr><td>' + item.live_category_id + '</td><td><b>' + App.esc(item.live_category_name) + '</b></td><td>' +
        item.live_category_sort + '</td><td>' + (item.live_category_status ? '<span class="tag green">启用</span>' : '<span class="tag red">停用</span>') + '</td><td>' +
        '<button class="action-btn" data-edit="' + item.live_category_id + '">编辑</button> <button class="action-btn del" data-del="' + item.live_category_id + '">删除</button></td></tr>'; }).join('') : '<tr><td colspan="5" class="empty">暂无分类</td></tr>') +
      '</tbody></table></div></div>';
    App.on('liveCategoryAdd', 'click', function () { openLiveCategoryModal(null); });
    pane.querySelectorAll('[data-edit]').forEach(function (button) { button.onclick = function () { openLiveCategoryModal(rows.find(function (x) { return x.live_category_id === Number(button.dataset.edit); })); }; });
    pane.querySelectorAll('[data-del]').forEach(function (button) {
      button.onclick = async function () {
        if (!confirm('删除分类后，所属频道会移至未分类。继续？')) return;
        var deleted = await App.req('/live/category/' + button.dataset.del, { method: 'DELETE' });
        App.toast(deleted.msg || '分类已删除'); renderLiveCategories();
      };
    });
  }

  function openLiveCategoryModal(item) {
    item = item || {};
    var body = '<div class="row2">' + App.field('分类名称 *', App.input('liveCategoryName', item.live_category_name)) +
      App.field('排序', App.input('liveCategorySort', item.live_category_sort || 0, '', 'number')) + '</div>' +
      App.field('状态', App.select('liveCategoryStatus', [{ value: 1, label: '启用' }, { value: 0, label: '停用' }], item.live_category_status === 0 ? 0 : 1));
    App.modal(item.live_category_id ? '编辑直播分类' : '新增直播分类', body, async function () {
      var result = await App.req('/live/category/save', { method: 'POST', body: {
        live_category_id: item.live_category_id || undefined, live_category_name: App.val('liveCategoryName'),
        live_category_sort: App.intVal('liveCategorySort'), live_category_status: App.intVal('liveCategoryStatus')
      } });
      if (result.code === 0) { App.closeModal(); App.toast(result.msg); renderLiveCategories(); }
      else App.toast(result.msg || '保存失败', true);
    });
  }

  Views.analytics = async function (host) {
    host.innerHTML = '<div id="analyticsRoot"><div class="empty">正在读取访问数据…</div></div>';
    var result = await App.req('/analytics?days=30');
    var data = result.data || {};
    var root = document.getElementById('analyticsRoot');
    if (!root) return;
    var trend = data.trend || [];
    var maxViews = Math.max(1, ...trend.map(function (day) { return Number(day.views) || 0; }));
    var modelNames = { vod: '影片', art: '文章', topic: '专题', actor: '明星', website: '网址', manga: '漫画' };
    root.innerHTML = '<div class="metric-grid">' + metric('近 30 天访问', data.views || 0) + metric('近 30 天访客', data.visitors || 0) +
      metric('影片总数', data.content && data.content.vod || 0) + metric('公开留言', data.public_gbook || 0) + '</div>' +
      '<div class="admin-card"><div class="card-head"><h3>详情页访问趋势（最近 30 天）</h3></div>' +
      (trend.length ? '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>日期</th><th>访问量</th><th>访客数</th><th>趋势</th></tr></thead><tbody>' + trend.map(function (day) {
        var width = Math.max(2, Math.round((Number(day.views) || 0) / maxViews * 100));
        return '<tr><td>' + App.esc(day.day) + '</td><td>' + day.views + '</td><td>' + day.visitors + '</td><td><div style="height:8px;max-width:320px;width:' + width + '%;border-radius:8px;background:var(--brand)"></div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">还没有详情页访问记录；访客打开影片、文章、专题、明星或网址详情后会开始统计。</div>') + '</div>' +
      '<div class="row2"><div class="admin-card"><div class="card-head"><h3>模型访问分布</h3></div>' + tableSimple((data.by_model || []).map(function (item) { return [modelNames[item.model] || item.model, item.views, item.visitors]; }), ['模型', '访问量', '访客数']) +
      '</div><div class="admin-card"><div class="card-head"><h3>热门内容</h3></div>' + tableSimple((data.top || []).map(function (item) { return [(modelNames[item.model] || item.model) + ' #' + item.content_id, item.views, App.fmtTime(item.last_view)]; }), ['内容', '访问量', '最近访问']) + '</div></div>';
  };

  function metric(label, value) {
    return '<div class="metric-card"><span>' + App.esc(label) + '</span><div class="metric-num">' + App.esc(value) + '</div></div>';
  }

  function tableSimple(rows, headers) {
    return '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' + headers.map(function (item) { return '<th>' + App.esc(item) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (row) { return '<tr>' + row.map(function (item) { return '<td>' + App.esc(item) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td class="empty" colspan="' + headers.length + '">暂无数据</td></tr>') + '</tbody></table></div>';
  }

  Views.audit = function (host) {
    host.innerHTML = '<div class="toolbar"><input class="input-box" id="auditKw" placeholder="管理员 / API 路径 / 方法" style="max-width:300px"><button class="action-btn" id="auditSearch">搜索</button></div>' +
      '<div class="admin-card"><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>路径</th><th>状态</th><th>来源 IP</th></tr></thead><tbody id="auditRows"></tbody></table></div><div id="auditPager"></div></div>';
    App.on('auditSearch', 'click', function () { loadAudit(1); });
    App.on('auditKw', 'keydown', function (event) { if (event.key === 'Enter') loadAudit(1); });
    loadAudit(1);
  };

  async function loadAudit(page) {
    var query = '?page=' + page + '&limit=30&wd=' + encodeURIComponent(App.val('auditKw'));
    var result = await App.req('/audit/list' + query);
    var data = result.data || {};
    var rows = data.list || [];
    var host = document.getElementById('auditRows');
    if (!host) return;
    host.innerHTML = rows.length ? rows.map(function (row) {
      return '<tr><td>' + App.fmtTime(row.created_at) + '</td><td>' + App.esc(row.admin_name) + '</td><td><span class="tag">' + App.esc(row.method) + '</span></td>' +
        '<td class="code">' + App.esc(row.path) + '</td><td>' + (row.response_status < 400 ? '<span class="tag green">' : '<span class="tag red">') + row.response_status + '</span></td><td>' + App.esc(row.client_ip || '-') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">暂无写操作记录</td></tr>';
    document.getElementById('auditPager').innerHTML = App.pager(data, loadAudit);
  }

  Views.apidoc = function (host) {
    var endpoints = [
      ['GET', '/api.php/provide/vod/?ac=list', '获取视频分类与分页概要；支持 at=xml、pg、t、wd、ids。'],
      ['GET', '/api.php/provide/vod/?ac=videolist&h=24', '获取最近更新视频详情、播放和下载线路；兼容 v8 action、rday、play、xt 参数。'],
      ['GET', '/api.php/provide/art/?ac=list', '文章分类与分页数据。'],
      ['GET', '/api.php/provide/actor/?ac=list', '明星列表。'],
      ['GET', '/api.php/provide/role/?ac=list', '角色列表。'],
      ['GET', '/api.php/provide/website/?ac=list&at=xml', '网址导航列表；支持 JSON/XML。'],
      ['GET', '/api.php/provide/manga/?ac=list&at=xml', 'MacCMS10 漫画列表；支持 JSON/XML 和分类筛选。'],
      ['GET', '/api/manga/list?page=1', '漫画列表；/api/manga/detail/:id 获取详情，/api/manga/chapters/:id 获取章节目录。'],
      ['GET', '/inc/api.php?action=videolist&rday=1', 'MacCMS v8 经典入口；apijson.php 与 apixml.php 也可用。'],
      ['GET', '/api/vod/list?page=1&limit=18', '前台视频列表；可加 type_id、year、area、letter、wd、by、order。'],
      ['GET', '/api/vod/detail/1', '视频详情、播放分组、下载分组；读取详情会累计点击。'],
      ['GET', '/api/art/list?page=1', '文章列表；/api/art/detail/:id 为文章详情。'],
      ['GET', '/api/topic/list', '专题列表；/api/topic/detail/:id 为专题详情。'],
      ['GET', '/api/actor/list?page=1', '明星列表；/api/actor/detail/:id 为明星详情。'],
      ['GET', '/api/live/categories', '已启用直播分类。'],
      ['GET', '/api/live/list?page=1&limit=48', '已启用直播频道；可加 category_id。'],
      ['GET', '/api/notices', '当前有效站点公告。'],
      ['POST', '/api/user/sign', '会员每日签到；达到已配置的连续签到里程碑时自动发放奖励。'],
      ['GET/POST', '/api/user/follows', '会员关注目标列表与关注切换。'],
      ['GET/POST', '/api/user/messages', '读取会员私信并发送站内消息。'],
      ['GET/POST', '/api/user/coupons', '查询已领取优惠券；POST /api/user/coupons/redeem 兑换优惠码。'],
      ['GET', '/api/mall/seckill', '当前有效且有活动库存的秒杀商品。'],
      ['GET', '/api/mall/goods', '积分商城商品列表。'],
      ['POST', '/api/mall/orders', '创建普通或秒杀订单；可传 user_coupon_id 抵扣，秒杀活动传 seckill_id。'],
      ['POST', '/api/mall/orders/:id/cancel', '取消本人待核款订单并自动返还积分、库存与优惠券。'],
      ['GET/POST', '/api/danmaku/list', '按 vod_id、episode_id 获取弹幕；POST /api/danmaku/add 提交弹幕。'],
      ['GET/POST', '/api/chatroom/messages', '获取聊天室消息；POST /api/chatroom/send 发送消息。'],
      ['POST', '/api/vod/play-fail', '提交影片播放故障反馈。'],
      ['POST', '/api/share', '记录会员或访客的内容分享事件。'],
      ['GET', '/sitemap.xml', '当前前台页面及已发布影片、文章、专题、明星和漫画的 XML Sitemap。'],
      ['GET', '/api.php/timming/index?h=24&key=YOUR_KEY', '定时采集入口；系统设置配置 timming_key 后需带 key。'],
    ];
    host.innerHTML = '<div class="admin-card"><div class="card-head"><h3>公开接口</h3><span class="muted">同源接口默认返回 JSON；Provide API 保持 MacCMS 字段结构</span></div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>方法</th><th>路径 / 示例</th><th>用途</th></tr></thead><tbody>' +
      endpoints.map(function (row) { return '<tr><td><span class="tag green">' + App.esc(row[0]) + '</span></td><td class="code">' + App.esc(row[1]) + '</td><td>' + App.esc(row[2]) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>' +
      '<div class="admin-card"><div class="card-head"><h3>鉴权与系统开关</h3></div><div class="help-block"><p>后台管理接口使用 <span class="code">/api/admin</span> 前缀；登录后在请求头发送 <span class="code">Authorization: Bearer &lt;token&gt;</span>。</p>' +
      '<p>用户接口包括 <span class="code">/api/user/register</span>、<span class="code">/api/user/login</span>、<span class="code">/api/user/profile</span>、<span class="code">/api/user/history</span> 与 <span class="code">/api/user/favs</span>；需登录的接口使用用户 Bearer Token。</p>' +
      '<p>XML Provide 输出、会员注册、全站评论和新评论审核策略均由「系统设置」控制。</p></div></div>';
  };

  Views.database = function (host) {
    host.innerHTML = '<div class="help-block" style="margin-bottom:12px">D1 不提供 MySQL 控制台、任意 SQL 执行或本机文件备份。这里按业务数据表导出 JSON；还原按主键覆盖同 ID 记录，每次最多处理 500 行。</div>' +
      '<div class="toolbar"><select class="admin-select" id="backupTable" style="max-width:260px"></select><button class="action-btn" id="refreshTables">刷新表信息</button>' +
      '<button class="btn-create" id="exportTable">导出 JSON</button><label class="action-btn" for="importFile" style="display:inline-flex;align-items:center">选择备份还原</label><input id="importFile" type="file" accept="application/json,.json" hidden></div>' +
      '<div id="databaseTableInfo" class="admin-card"><div class="empty">正在读取 D1 表信息…</div></div><div id="databaseNotice" class="help-block"></div>';
    App.on('refreshTables', 'click', loadDatabaseTables);
    App.on('exportTable', 'click', exportTable);
    App.on('importFile', 'change', importTable);
    loadDatabaseTables();
  };

  async function loadDatabaseTables() {
    var result = await App.req('/database/tables');
    var select = document.getElementById('backupTable');
    if (!select) return;
    var tables = result.data || [];
    select.innerHTML = tables.map(function (table) { return '<option value="' + App.esc(table.name) + '">' + App.esc(table.name) + '（' + table.rows + ' 行）</option>'; }).join('');
    document.getElementById('databaseTableInfo').innerHTML = '<div class="card-head"><h3>D1 业务表</h3><span class="muted">共 ' + tables.length + ' 张可迁移表</span></div>' +
      tableSimple(tables.map(function (table) { return [table.name, table.rows]; }), ['数据表', '记录数']);
  }

  async function exportTable() {
    var table = App.val('backupTable');
    if (!table) return;
    var result = await App.req('/database/export/' + encodeURIComponent(table));
    if (result.code !== 0) { App.toast(result.msg || '导出失败', true); return; }
    var blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'maccms-' + table + '-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(link.href);
    document.getElementById('databaseNotice').textContent = result.data.truncated ? '导出达到 10,000 行上限；该表备份不完整，请按业务范围分批导出。' : '已导出 ' + result.data.rows.length + ' 行。';
  }

  async function importTable(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    var table = App.val('backupTable');
    try {
      var backup = JSON.parse(await file.text());
      if (backup.table !== table || !Array.isArray(backup.rows) || !backup.rows.length) throw new Error('请选择与当前数据表匹配的 MacCMS JSON 备份文件');
      if (!confirm('将还原 ' + backup.rows.length + ' 行到「' + table + '」。同主键记录会被备份内容覆盖，继续吗？')) return;
      var restored = 0;
      for (var i = 0; i < backup.rows.length; i += 500) {
        var result = await App.req('/database/import/' + encodeURIComponent(table), { method: 'POST', body: { rows: backup.rows.slice(i, i + 500) } });
        if (result.code !== 0) throw new Error(result.msg || '还原失败');
        restored += result.data.restored || 0;
        document.getElementById('databaseNotice').textContent = '还原进度：' + restored + ' / ' + backup.rows.length + ' 行';
      }
      App.toast('还原完成，共 ' + restored + ' 行');
      document.getElementById('databaseNotice').textContent = '还原完成，共 ' + restored + ' 行。';
      loadDatabaseTables();
    } catch (err) { App.toast(err.message || '备份文件读取失败', true); }
  }

  Views.urlsend = async function (host) {
    host.innerHTML = '<div class="admin-card"><div class="card-head"><h3>百度主动推送</h3><a class="action-btn" href="/sitemap.xml" target="_blank" rel="noopener">查看 Sitemap</a></div>' +
      '<div class="help-block">推送已发布详情页 URL。请先在系统设置中设置正确的站点网址，并在百度搜索资源平台获取该站点的推送 Token。</div>' +
      '<div class="row2" style="margin-top:12px"><div id="urlSiteInfo" class="help-block">正在加载站点配置…</div>' + App.field('百度推送 Token', '<input class="input-box" id="baiduToken" type="password" autocomplete="new-password" placeholder="填写新 Token；留空保持当前值">') + '</div>' +
      '<div class="toolbar"><button class="action-btn" id="saveBaiduToken">保存 Token</button><label class="muted"><input id="clearBaiduToken" type="checkbox"> 清除已保存 Token</label></div>' +
      '<div class="row3">' + App.field('内容模型', App.select('pushModel', [{ value: 'vod', label: '影片详情' }, { value: 'art', label: '文章详情' }, { value: 'topic', label: '专题详情' }, { value: 'actor', label: '明星详情' }, { value: 'manga', label: '漫画详情' }], 'vod')) +
      App.field('推送最新条数（最多 1000）', App.input('pushLimit', 100, '', 'number')) + '<div class="form-group"><label class="form-label">推送操作</label><button class="btn-create" id="pushUrls">推送已发布内容</button></div></div>' +
      '<div id="pushResult" class="log-box">等待推送。</div></div><div class="admin-card"><div class="card-head"><h3>最近推送记录</h3><button class="action-btn" id="refreshPushHistory">刷新</button></div><div id="pushHistory"></div></div>';
    App.on('saveBaiduToken', 'click', savePushToken);
    App.on('pushUrls', 'click', pushUrls);
    App.on('refreshPushHistory', 'click', loadPushHistory);
    var settings = await App.req('/urlsend/settings');
    var siteInfo = document.getElementById('urlSiteInfo');
    siteInfo.textContent = '当前站点：' + (settings.data && settings.data.site_url || '尚未配置') + '；Token ' + (settings.data && settings.data.has_token ? '已保存' : '未配置');
    loadPushHistory();
  };

  async function savePushToken() {
    var clear = document.getElementById('clearBaiduToken').checked;
    var result = await App.req('/urlsend/settings', { method: 'POST', body: { token: App.val('baiduToken'), clear: clear } });
    if (result.code === 0) { App.toast(result.msg); document.getElementById('baiduToken').value = ''; document.getElementById('clearBaiduToken').checked = false; Views.urlsend(document.getElementById('viewHost')); }
    else App.toast(result.msg || '保存失败', true);
  }

  async function pushUrls() {
    var resultBox = document.getElementById('pushResult');
    resultBox.textContent = '正在向百度提交 URL…';
    var result = await App.req('/urlsend/push', { method: 'POST', body: { model: App.val('pushModel'), limit: App.intVal('pushLimit') } });
    resultBox.textContent = JSON.stringify(result.data || { message: result.msg }, null, 2);
    if (result.code === 0) App.toast(result.msg); else App.toast(result.msg || '推送失败', true);
    loadPushHistory();
  }

  async function loadPushHistory() {
    var result = await App.req('/urlsend/history');
    var rows = result.data || [];
    var names = { vod: '影片', art: '文章', topic: '专题', actor: '明星' };
    var root = document.getElementById('pushHistory');
    if (!root) return;
    root.innerHTML = rows.length ? tableSimple(rows.map(function (item) { return [App.fmtTime(item.created_at), names[item.model] || item.model,
      item.submitted, item.success, item.remain, item.status, String(item.response || '').slice(0, 110)]; }), ['时间', '模型', '提交', '成功', '剩余额度', 'HTTP', '响应摘要']) : '<div class="empty">暂无推送记录</div>';
  }
})(window);
