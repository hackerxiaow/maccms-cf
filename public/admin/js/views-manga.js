// ========================================================
// 后台视图：MacCMS v10 漫画管理 (manga / type_mid=12)
// ========================================================
(function (global) {
  'use strict';
  var Views = global.Views = global.Views || {};
  var mangaPage = 1;

  Views.manga = function (host) {
    host.innerHTML =
      '<div class="toolbar"><input class="input-box" id="mangaKw" placeholder="搜索漫画名、作者或标签" style="max-width:250px">' +
      '<select class="admin-select" id="mangaStatus" style="width:auto;min-width:115px"><option value="-1">全部状态</option><option value="1">已发布</option><option value="0">已隐藏</option></select>' +
      '<button class="action-btn" id="mangaSearch">搜索</button><button class="btn-create" id="mangaAdd">+ 新增漫画</button></div>' +
      '<div class="admin-card"><div class="toolbar"><span class="muted">批量操作：</span>' +
      '<button class="action-btn" data-manga-batch="publish">发布</button><button class="action-btn" data-manga-batch="hide">隐藏</button>' +
      '<button class="action-btn del" data-manga-batch="delete">删除</button></div>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      '<th><input type="checkbox" class="checkbox" id="mangaSelectAll"></th><th>ID</th><th>封面</th><th>漫画名称</th><th>分类</th><th>作者 / 来源</th><th>连载 / 章节</th><th>状态</th><th>推荐</th><th>更新时间</th><th>操作</th>' +
      '</tr></thead><tbody id="mangaBody"></tbody></table></div><div id="mangaPager"></div></div>' +
      '<p class="help-block">章节资源沿用 MacCMS 的多来源文本格式；分类请先在“分类体系”中添加漫画模型 (type_mid=12)。</p>';
    App.on('mangaSearch', 'click', function () { loadMangaTable(1); });
    App.on('mangaAdd', 'click', function () { openMangaModal(null); });
    App.on('mangaSelectAll', 'change', function (event) {
      document.querySelectorAll('#mangaBody [data-manga-select]').forEach(function (box) { box.checked = event.target.checked; });
    });
    document.querySelectorAll('[data-manga-batch]').forEach(function (button) {
      button.onclick = function () { runMangaBatch(button.dataset.mangaBatch); };
    });
    loadMangaTable(1);
  };

  async function runMangaBatch(action) {
    var ids = Array.from(document.querySelectorAll('#mangaBody [data-manga-select]:checked'))
      .map(function (box) { return parseInt(box.value, 10); }).filter(Boolean);
    if (!ids.length) { App.toast('请先选择漫画', true); return; }
    if (action === 'delete' && !confirm('确定批量删除选中的 ' + ids.length + ' 部漫画？')) return;
    var result = await App.req(action === 'delete' ? '/manga/batch/delete' : '/manga/batch/status', {
      method: 'POST', body: { ids: ids, status: action === 'publish' ? 1 : 0 }
    });
    if (result.code === 0) { App.toast(result.msg || '批量操作完成'); loadMangaTable(1); }
    else App.toast(result.msg || '批量操作失败', true);
  }

  async function loadMangaTable(page) {
    mangaPage = page;
    var body = document.getElementById('mangaBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="11" class="empty">载入中…</td></tr>';
    var q = '?page=' + page + '&limit=20&status=' + encodeURIComponent(App.val('mangaStatus') || '-1');
    var kw = App.val('mangaKw');
    if (kw) q += '&wd=' + encodeURIComponent(kw);
    var j = await App.req('/manga/list' + q);
    if (j.code !== 0) { body.innerHTML = '<tr><td colspan="11" class="empty">加载失败</td></tr>'; return; }
    var list = j.data.list || [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="11" class="empty">暂无漫画</td></tr>';
      document.getElementById('mangaPager').innerHTML = '';
      return;
    }
    body.innerHTML = list.map(function (m) {
      var cover = m.manga_pic ? '<img src="' + App.esc(m.manga_pic) + '" alt="" loading="lazy" style="width:38px;height:52px;object-fit:cover;border-radius:5px">' : '<span class="muted">—</span>';
      return '<tr><td><input type="checkbox" class="checkbox" data-manga-select value="' + m.manga_id + '"></td>' +
        '<td>' + m.manga_id + '</td><td>' + cover + '</td><td><b>' + App.esc(m.manga_name) + '</b><div class="muted">' + App.esc(m.manga_sub || '') + '</div></td>' +
        '<td><span class="tag">' + App.esc(m.type_name || (m.type_id || '未分类')) + '</span></td>' +
        '<td>' + App.esc(m.manga_author || '—') + ' / ' + App.esc(m.manga_from || '—') + '</td>' +
        '<td>' + App.esc(m.manga_serial || '连载中') + ' / ' + (m.manga_total || 0) + ' 话</td>' +
        '<td>' + (m.manga_status ? '<span class="tag green">已发布</span>' : '<span class="tag red">已隐藏</span>') + (m.manga_lock ? ' <span class="tag gold">锁定</span>' : '') + '</td>' +
        '<td>' + (m.manga_level || 0) + '</td><td>' + App.fmtTime(m.manga_time) + '</td>' +
        '<td><button class="action-btn" data-manga-edit="' + m.manga_id + '">编辑</button> <button class="action-btn del" data-manga-del="' + m.manga_id + '">删除</button></td></tr>';
    }).join('');
    var selectAll = document.getElementById('mangaSelectAll');
    if (selectAll) selectAll.checked = false;
    document.querySelectorAll('#mangaBody [data-manga-edit]').forEach(function (button) {
      button.onclick = function () { openMangaModal(parseInt(button.dataset.mangaEdit, 10)); };
    });
    document.querySelectorAll('#mangaBody [data-manga-del]').forEach(function (button) {
      button.onclick = async function () {
        if (!confirm('确定删除这部漫画及其章节地址？')) return;
        var result = await App.req('/manga/' + button.dataset.mangaDel, { method: 'DELETE' });
        if (result.code === 0) { App.toast('漫画已删除'); loadMangaTable(page); }
        else App.toast(result.msg || '删除失败', true);
      };
    });
    document.getElementById('mangaPager').innerHTML = App.pager(j.data, function (nextPage) { loadMangaTable(nextPage); });
  }

  async function openMangaModal(id) {
    var manga = {};
    if (id) {
      var result = await App.req('/manga/' + id);
      if (result.code === 0) manga = result.data;
    }
    var categories = App.types.filter(function (type) { return Number(type.type_mid) === 12; })
      .map(function (type) { return { value: type.type_id, label: (type.type_pid > 0 ? '└ ' : '') + type.type_name }; });
    var statusOptions = [{ value: 1, label: '已发布' }, { value: 0, label: '隐藏' }];
    var body =
      '<div class="row2">' + App.field('漫画名称 *', App.input('mName', manga.manga_name)) + App.field('主分类', App.select('mType', categories, manga.type_id)) + '</div>' +
      '<div class="row3">' + App.field('副标题', App.input('mSub', manga.manga_sub)) + App.field('英文名 / 拼音', App.input('mEn', manga.manga_en)) + App.field('次级分类', App.select('mType1', categories, manga.type_id_1, '无')) + '</div>' +
      '<div class="row3">' + App.field('状态', App.select('mStatus', statusOptions, manga.manga_status === 0 ? 0 : 1)) + App.field('推荐级别 (0–9)', App.input('mLevel', manga.manga_level || 0, '', 'number')) + App.field('采集锁定', App.select('mLock', [{ value: 0, label: '否' }, { value: 1, label: '是' }], manga.manga_lock || 0)) + '</div>' +
      '<div class="row3">' + App.field('作者', App.input('mAuthor', manga.manga_author)) + App.field('来源', App.input('mFrom', manga.manga_from)) + App.field('首字母', App.input('mLetter', manga.manga_letter)) + '</div>' +
      '<div class="row3">' + App.field('标签', App.input('mTag', manga.manga_tag)) + App.field('扩展分类', App.input('mClass', manga.manga_class)) + App.field('备注 / 更新至', App.input('mRemarks', manga.manga_remarks)) + '</div>' +
      '<div class="row3">' + App.field('封面图 URL', App.input('mPic', manga.manga_pic)) + App.field('缩略图 URL', App.input('mPicThumb', manga.manga_pic_thumb)) + App.field('横版图 URL', App.input('mPicSlide', manga.manga_pic_slide)) + '</div>' +
      App.field('截图 URL（每行一张）', App.textarea('mScreens', manga.manga_pic_screenshot, 2)) +
      '<div class="row3">' + App.field('连载状态', App.input('mSerial', manga.manga_serial || '连载中')) + App.field('章节总数', App.input('mTotal', manga.manga_total || 0, '', 'number')) + App.field('年龄分级', App.select('mAge', [{ value: 0, label: '全年龄' }, { value: 1, label: '12+' }, { value: 2, label: '18+' }], manga.manga_age_rating || 0)) + '</div>' +
      '<div class="row3">' + App.field('阅读方向', App.select('mOrientation', [{ value: 0, label: '默认' }, { value: 1, label: '从左到右' }, { value: 2, label: '从右到左' }, { value: 3, label: '垂直' }], manga.manga_orientation || 0)) + App.field('VIP 内容', App.select('mVip', [{ value: 0, label: '否' }, { value: 1, label: '是' }], manga.manga_is_vip || 0)) + App.field('最低会员组 ID', App.input('mGroup', manga.group_id || 0, '0=公开', 'number')) + '</div>' +
      '<div class="row3">' + App.field('访问积分', App.input('mPoints', manga.manga_points || 0, '', 'number')) + App.field('每章积分', App.input('mPointsDetail', manga.manga_points_detail || 0, '', 'number')) + App.field('版权信息', App.input('mCopyright', manga.manga_copyright_info)) + '</div>' +
      '<div class="row2">' + App.field('章节来源标识（$$$ 分隔）', App.input('mChapterFrom', manga.manga_chapter_from)) + App.field('独立模板', App.input('mTpl', manga.manga_tpl)) + '</div>' +
      App.field('章节地址（MacCMS 原始章节文本格式）', App.textarea('mChapterUrl', manga.manga_chapter_url, 7)) +
      '<div class="row2">' + App.field('简介', App.textarea('mBlurb', manga.manga_blurb, 2)) + App.field('跳转 URL', App.input('mJump', manga.manga_jumpurl)) + '</div>' +
      App.field('详细介绍 (HTML)', App.textarea('mContent', manga.manga_content, 6)) +
      '<div class="row3">' + App.field('关联漫画 ID', App.input('mRelManga', manga.manga_rel_manga)) + App.field('关联视频 ID', App.input('mRelVod', manga.manga_rel_vod)) + App.field('访问密码', App.input('mPwd', manga.manga_pwd)) + '</div>' +
      App.field('密码跳转 URL', App.input('mPwdUrl', manga.manga_pwd_url));

    App.modal(id ? '编辑漫画 #' + id : '新增漫画', body, async function () {
      var payload = {
        manga_id: id || undefined,
        manga_name: App.val('mName'), type_id: App.intVal('mType'), type_id_1: App.intVal('mType1'),
        manga_sub: App.val('mSub'), manga_en: App.val('mEn'), manga_status: App.intVal('mStatus'),
        manga_level: App.intVal('mLevel'), manga_lock: App.intVal('mLock'), manga_author: App.val('mAuthor'),
        manga_from: App.val('mFrom'), manga_letter: App.val('mLetter'), manga_tag: App.val('mTag'),
        manga_class: App.val('mClass'), manga_remarks: App.val('mRemarks'), manga_pic: App.val('mPic'),
        manga_pic_thumb: App.val('mPicThumb'), manga_pic_slide: App.val('mPicSlide'), manga_pic_screenshot: App.val('mScreens'),
        manga_serial: App.val('mSerial'), manga_total: App.intVal('mTotal'), manga_age_rating: App.intVal('mAge'),
        manga_orientation: App.intVal('mOrientation'), manga_is_vip: App.intVal('mVip'), group_id: App.intVal('mGroup'),
        manga_points: App.intVal('mPoints'), manga_points_detail: App.intVal('mPointsDetail'),
        manga_copyright_info: App.val('mCopyright'), manga_chapter_from: App.val('mChapterFrom'),
        manga_tpl: App.val('mTpl'), manga_chapter_url: App.val('mChapterUrl'), manga_blurb: App.val('mBlurb'),
        manga_jumpurl: App.val('mJump'), manga_content: App.val('mContent'), manga_rel_manga: App.val('mRelManga'),
        manga_rel_vod: App.val('mRelVod'), manga_pwd: App.val('mPwd'), manga_pwd_url: App.val('mPwdUrl')
      };
      if (!payload.manga_name) { App.toast('请填写漫画名称', true); return; }
      var saved = await App.req('/manga/save', { method: 'POST', body: payload });
      if (saved.code === 0) { App.closeModal(); App.toast('漫画已保存'); loadMangaTable(mangaPage); }
      else App.toast(saved.msg || '保存失败', true);
    }, '保存漫画');
    var modal = document.querySelector('#appModal .modal-content');
    if (modal) modal.classList.add('wide');
  }
})(window);
