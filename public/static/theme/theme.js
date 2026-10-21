// ========================================================
// 海螺影视 Conch_M003 主题运行时 (Serverless 版)
// 提供：主题配置拉取与注入、组件渲染器、API 封装、通用交互
// ========================================================

(function (global) {
  'use strict';

  // ======================================================
  // 1. 配置拉取与 CSS 注入
  // ======================================================
  const Theme = {
    cfg: {},
    types: [],
    players: [],
    _ready: null,

    /** Load the unified Worker/Pages video UI after the legacy theme base styles. */
    _injectDesignSystem: function () {
      if (document.getElementById('maccms-serverless-video-ui')) return;
      const link = document.createElement('link');
      link.id = 'maccms-serverless-video-ui';
      link.rel = 'stylesheet';
      link.href = '/static/theme/css/serverless-video.css?v=20261021g';
      document.head.appendChild(link);
    },

    /** 拉取主题配置并注入运行时 CSS */
    init: function () {
      if (this._ready) return this._ready;
      this._injectDesignSystem();
      this._ready = fetch('/api/theme')
        .then(r => r.json())
        .then(json => {
          if (json.code === 0) {
            this.cfg = json.data.config || {};
            this._injectCss(json.data.cssVars || '');
            // 用户手动切换过的皮肤优先于站点默认配置
            try {
              const saved = localStorage.getItem('maccms_skin');
              if (saved !== null) this.cfg['theme.style.color'] = saved;
            } catch (e) {}
            this._applySkin();
          }
          return this.cfg;
        })
        .catch(e => {
          console.warn('主题配置加载失败，使用默认值', e);
          return {};
        });
      return this._ready;
    },

    /** 读取配置项 (支持 'a.b.c' 路径) */
    get: function (key, fallback) {
      if (this.cfg && this.cfg[key] !== undefined && this.cfg[key] !== '') return this.cfg[key];
      return fallback;
    },

    /** 读取布尔开关 */
    on: function (key, fallback) {
      if (fallback === undefined) fallback = false;
      const v = this.get(key, null);
      if (v === null) return fallback;
      return v === '1' || v === 'true' || v === 1;
    },

    /** 读取数字 */
    num: function (key, fallback) {
      if (fallback === undefined) fallback = 0;
      const v = parseInt(this.get(key, ''), 10);
      return isNaN(v) ? fallback : v;
    },

    _injectCss: function (css) {
      const el = document.createElement('style');
      el.id = 'maccms-runtime-theme';
      el.textContent = css;
      document.head.appendChild(el);
    },

    /** 应用深浅色皮肤 */
    _applySkin: function () {
      const dark = this.get('theme.style.color', '0') === '1';
      const link = document.querySelector('link[name="color"]');
      if (link) {
        link.href = dark ? '/static/theme/css/black.css' : '/static/theme/css/white.css';
      }
      // 背景与文字色交由原生 white.css / black.css 控制，这里只标记皮肤，
      // 供 maccms.css 中的 --tx / --hl-bg 等扩展变量按皮肤切换
      document.documentElement.setAttribute('data-skin', dark ? 'black' : 'white');
    },

    /** 切换皮肤并持久化到 localStorage */
    toggleSkin: function () {
      const cur = this.get('theme.style.color', '0') === '1';
      const next = cur ? '0' : '1';
      this.cfg['theme.style.color'] = next;
      this._applySkin();
      try { localStorage.setItem('maccms_skin', next); } catch (e) {}
    },

    /** 启动时恢复用户上次选择的皮肤 */
    restoreSkin: function () {
      try {
        const saved = localStorage.getItem('maccms_skin');
        if (saved !== null && saved !== this.get('theme.style.color', '0')) {
          this.cfg['theme.style.color'] = saved;
          this._applySkin();
        }
      } catch (e) {}
    },
  };

  // ======================================================
  // 2. API 封装
  // ======================================================
  const API = {
    async get(path, params) {
      const u = new URL(path, location.origin);
      if (params) {
        Object.keys(params).forEach(k => {
          const v = params[k];
          if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
        });
      }
      try {
        const language = localStorage.getItem('maccms_content_language') || '';
        if (language && !u.searchParams.has('lang')) u.searchParams.set('lang', language);
      } catch (e) {}
      const token = localStorage.getItem('maccms_user_token') || '';
      const r = await fetch(u.toString(), { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      return r.json();
    },
    async post(path, body) {
      const token = localStorage.getItem('maccms_user_token') || '';
      const r = await fetch(path, {
        method: 'POST',
        headers: token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      return r.json();
    },
  };

  // ======================================================
  // 3. 工具函数
  // ======================================================
  const U = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    },
    /** 海螺风格：把逗号分隔的演员串转成可点链接 */
    actorLinks: function (str) {
      if (!str) return '未知';
      return String(str).split(/[,，]/).filter(Boolean)
        .map(a => `<a href="javascript:;" class="hl-text-hover">${U.esc(a.trim())}</a>`)
        .join('<i>/</i>');
    },
    /** 生成完整查询串（用于筛选器 URL） */
    query: function (obj, remove) {
      const u = new URLSearchParams();
      Object.keys(obj).forEach(k => {
        if (remove && remove.indexOf(k) >= 0) return;
        const v = obj[k];
        if (v !== undefined && v !== null && v !== '') u.set(k, v);
      });
      const s = u.toString();
      return s ? '?' + s : '';
    },
    /** 影片状态文字 */
    stateText: function (v) {
      if (!v) return '已完结';
      return v;
    },
    /** 评分数值 */
    score: function (v) {
      const n = parseFloat(v);
      return isNaN(n) || n <= 0 ? '' : n.toFixed(1);
    },
    /** 图片占位（SVG DataURI） */
    placeholder: function (title, seed) {
      const palettes = [
        ['#1d2a52', '#4a1d3d', '#0099ff'],
        ['#0d3d40', '#122a4f', '#00bbff'],
        ['#3d2a12', '#4a1d2d', '#f5a623'],
        ['#132a3d', '#331d1d', '#ff7a45'],
        ['#241a4d', '#1d2a4d', '#7c5cff'],
      ];
      const p = palettes[Math.abs(seed || 0) % palettes.length];
      const ch = U.esc((title || '影').trim().charAt(0) || '影');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0.7" y2="1">' +
        '<stop offset="0%" stop-color="' + p[0] + '"/><stop offset="100%" stop-color="' + p[1] + '"/>' +
        '</linearGradient></defs><rect width="300" height="450" fill="url(#g)"/>' +
        '<text x="150" y="235" font-size="118" font-weight="800" text-anchor="middle" fill="#fff" fill-opacity="0.2" font-family="sans-serif">' + ch + '</text></svg>';
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },
    hash: function (str) {
      let h = 0;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
      return Math.abs(h);
    },
  };

  // ======================================================
  // 4. 海螺组件渲染器 (对齐 hl- 类名体系)
  // ======================================================

  /** 影视卡片 (widget/vod-item.html) */
  const Card = {
    item: function (v, opt) {
      opt = opt || {};
      const showScore = opt.showScore !== undefined ? opt.showScore : Theme.on('theme.cover.score', true);
      const showTag = opt.showTag !== undefined ? opt.showTag : Theme.on('theme.cover.tag', true);
      const ph = U.placeholder(v.vod_name, U.hash(v.vod_name));

      let tagHtml = '';
      if (showTag) {
        const dbl = parseFloat(v.vod_douban_score || 0);
        if (dbl > 7.6) {
          tagHtml = '<span class="douban">豆瓣高分</span>';
        } else if (v.vod_remarks) {
          tagHtml = '<span class="state">' + U.esc(v.vod_remarks) + '</span>';
        } else if (v.vod_year) {
          tagHtml = '<span class="version">' + U.esc(v.vod_year) + '</span>';
        }
      }

      const scoreHtml = showScore && parseFloat(v.vod_score || 0) > 0
        ? '<span class="hl-text-conch score">' + U.score(v.vod_score) + '</span>' : '';

      return '<a class="hl-item-thumb hl-lazy" href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '" data-original="' + U.esc(v.vod_pic || ph) + '">' +
        '<div class="hl-pic-icon hl-hidden-xs"><i class="iconfont hl-icon-bofang-fill"></i></div>' +
        (tagHtml ? '<div class="hl-pic-tag">' + tagHtml + '</div>' : '') +
        '<div class="hl-pic-text"><span class="hl-lc-1 remarks">' + U.esc(v.vod_remarks || (v.vod_isend ? '已完结' : '连载中')) + '</span></div>' +
        '</a>' +
        '<div class="hl-item-text">' +
        '<div class="hl-item-title hl-text-site hl-lc-1"><a href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '">' + U.esc(v.vod_name) + '</a></div>' +
        '<div class="hl-item-sub hl-text-muted hl-lc-1">' + scoreHtml + U.esc(v.vod_sub || v.vod_actor || '未知') + '</div>' +
        '</div>';
    },

    /** 横向大卡片 (widget/vod-item-one.html) */
    itemOne: function (v) {
      const ph = U.placeholder(v.vod_name, U.hash(v.vod_name));
      return '<div class="hl-item-wrap clearfix">' +
        '<div class="hl-item-div hl-item-div1 hl-col-xs-75w hl-col-sm-50w hl-col-md-40w">' +
        '<div class="hl-item-pic"><a class="hl-item-thumb hl-lazy" href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '" data-original="' + U.esc(v.vod_pic || ph) + '">' +
        '<div class="hl-pic-icon hl-hidden-xs"><i class="iconfont hl-icon-bofang-fill"></i></div></a></div>' +
        '<div class="hl-item-content">' +
        '<div class="hl-item-title hl-text-site hl-lc-2"><a href="/detail.html?id=' + v.vod_id + '">' + U.esc(v.vod_name) + '</a></div>' +
        '<div class="hl-item-sub hl-text-muted hl-lc-1">' + U.esc(v.vod_sub || v.vod_actor || '未知') + '</div>' +
        '<div class="hl-item-remarks">' + U.esc(v.vod_remarks || '已完结') + '</div>' +
        '</div></div>' +
        '<div class="hl-item-div hl-item-div2 hl-col-sm-15w hl-col-md-10w hl-hidden-xs"><div class="hl-item-datas hl-lc-1">' + U.esc(v.type_name || '') + '</div></div>' +
        '<div class="hl-item-div hl-item-div3 hl-col-sm-20w hl-col-md-15w hl-hidden-xs"><div class="hl-item-datas hl-lc-1">' +
        '<span>' + U.esc(v.vod_year || '未知') + '</span><i>/</i><span>' + U.esc(v.vod_area || '未知') + '</span></div></div>' +
        '<div class="hl-item-div hl-item-div4 hl-col-md-25w hl-hidden-xs hl-hidden-sm"><div class="hl-item-datas hl-lc-1">' + U.esc(v.vod_blurb || v.vod_content || '暂无简介') + '</div></div>' +
        '</div>';
    },

    /** 排行榜条目 (widget/rank-item.html + rank-item-total.html) */
    rankItem: function (v, key) {
      const ph = U.placeholder(v.vod_name, U.hash(v.vod_name));
      const scoreHtml = parseFloat(v.vod_score || 0) > 0
        ? '<span class="hl-text-conch score">' + U.score(v.vod_score) + '</span> ' : '';
      return '<div class="hl-item-wrap clearfix">' +
        '<div class="hl-item-div hl-item-div1 hl-col-xs-75w hl-col-sm-50w hl-col-md-40w">' +
        '<div class="hl-item-num"><span class="hl-part-nums hl-num-' + key + '">' + key + '</span></div>' +
        '<div class="hl-item-pic"><a class="hl-item-thumb hl-lazy" href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '" data-original="' + U.esc(v.vod_pic || ph) + '">' +
        '<div class="hl-pic-icon hl-hidden-xs"><i class="iconfont hl-icon-bofang-fill"></i></div></a></div>' +
        '<div class="hl-item-content">' +
        '<div class="hl-item-title hl-text-site hl-lc-2"><a href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '">' + U.esc(v.vod_name) + '</a></div>' +
        '<div class="hl-item-sub hl-text-muted hl-lc-1">' + U.esc(v.vod_sub || v.vod_actor || '未知') + '</div>' +
        '<div class="hl-item-remarks">' + scoreHtml + U.esc(v.vod_remarks || (v.vod_isend ? '已完结' : '连载中')) + '</div>' +
        '</div></div>' +
        '<div class="hl-item-div hl-item-div2 hl-col-sm-15w hl-col-md-10w hl-hidden-xs"><div class="hl-item-datas hl-lc-1">' + U.esc(v.type_name || '') + '</div></div>' +
        '<div class="hl-item-div hl-item-div3 hl-col-sm-20w hl-col-md-15w hl-hidden-xs"><div class="hl-item-datas hl-lc-1">' +
        '<span>' + U.esc(v.vod_year || '未知') + '</span><i>/</i><span>' + U.esc(v.vod_area || '未知') + '</span><i>/</i>' + U.esc(v.vod_class || '内详') + '</div></div>' +
        '<div class="hl-item-div hl-item-div4 hl-col-md-25w hl-hidden-xs hl-hidden-sm"><div class="hl-item-datas hl-lc-1">' + U.esc(v.vod_blurb || v.vod_content || '暂无简介') + '</div></div>' +
        '<div class="hl-item-div hl-item-div5 hl-col-xs-25w hl-col-sm-15w hl-col-md-10w">' +
        '<div class="hl-item-hits"><span class="hl-part-nums hl-num-' + key + '">' + (v.vod_hits || 0) + '</span><span class="hl-text-muted">人气指数</span></div>' +
        '</div></div>';
    },

    /** 首页内嵌排行榜 (widget/rank-home.html) */
    rankHome: function (items, typeName, rankUrl) {
      if (!items || !items.length) return '';
      return '<div class="hl-vod-rank hl-bg-site hl-col-xs-12 hl-col-sm-3 hl-col-md-20w hl-col-lg-2 clearfix">' +
        '<div class="hl-rb-head clearfix">' +
        '<h2 class="hl-rb-title"><a href="' + (rankUrl || '/rank.html') + '">' + U.esc(typeName || '') + '排行榜</a></h2>' +
        '<a class="hl-rb-more hl-text-muted hl-hide-sm hl-pull-right" href="' + (rankUrl || '/rank.html') + '">更多<i class="iconfont hl-icon-jiantouyou"></i></a></div>' +
        '<div class="hl-rank-box hl-bg-subs"><div class="hl-rank-bgicon"><i class="iconfont hl-icon-jiangzhang"></i></div>' +
        '<ul class="hl-rank-list hl-col-xs-12 clearfix">' +
        items.slice(0, 8).map((v, i) =>
          '<li><a class="hl-lc-1" href="/detail.html?id=' + v.vod_id + '" title="' + U.esc(v.vod_name) + '">' +
          '<span class="hl-part-nums hl-num-' + (i + 1) + '">' + (i + 1) + '</span>' +
          '<span class="hl-item-pic hl-hide-sm"><i class="hl-item-thumb hl-lazy" data-original="' + U.esc(v.vod_pic || U.placeholder(v.vod_name, U.hash(v.vod_name))) + '"></i></span>' +
          '<span class="hl-item-data hl-pull-right hl-text-muted hl-hide-sm">' + U.esc((v.vod_class || '').slice(0, 2)) + '</span>' +
          '<span class="hl-item-name">' + U.esc(v.vod_name) + '</span>' +
          (v.vod_year ? '<span class="hl-text-muted hl-hide-sm"> / ' + U.esc(v.vod_year) + '</span>' : '') +
          '</a></li>'
        ).join('') +
        '</ul></div></div>';
    },

    /** 专题卡片 (widget/topic-item.html) */
    topicItem: function (t) {
      const ph = U.placeholder(t.topic_name, U.hash(t.topic_name));
      return '<div class="hl-item-wrap">' +
        '<a class="hl-item-thumb hl-lazy" href="/topic.html?id=' + t.topic_id + '" title="' + U.esc(t.topic_name) + '" data-original="' + U.esc(t.topic_pic || ph) + '">' +
        '<div class="hl-pic-icon hl-hidden-xs"><i class="iconfont hl-icon-lianjie"></i></div>' +
        '<div class="hl-item-icon"><i class="iconfont hl-icon-zhuanti-fill"></i></div>' +
        '<div class="hl-item-text">' +
        '<div class="hl-item-title hl-lc-2">' + U.esc(t.topic_name) + '</div>' +
        '<div class="remarks">精选专题</div>' +
        '</div></a></div>';
    },

    /** 资讯卡片 (widget/art-item.html) */
    artItem: function (a) {
      const ph = U.placeholder(a.art_name, U.hash(a.art_name));
      return '<div class="hl-item-wrap">' +
        '<div class="row"><div class="hl-item-div">' +
        '<div class="hl-item-pic hl-col-xs-4 hl-col-sm-12">' +
        '<a href="/art.html?id=' + a.art_id + '" title="' + U.esc(a.art_name) + '" class="hl-item-thumb hl-lazy" data-original="' + U.esc(a.art_pic || ph) + '">' +
        '<span class="hl-pic-icon hl-hidden-xs"><i class="iconfont hl-icon-lianjie"></i></span>' +
        '</a></div>' +
        '<div class="hl-item-content hl-col-xs-8 hl-col-sm-12">' +
        '<a class="hl-text-site" href="/art.html?id=' + a.art_id + '" title="' + U.esc(a.art_name) + '">' +
        '<div class="hl-item-title hl-lc-2">' + U.esc(a.art_name) + '</div></a>' +
        '<div class="hl-item-blurb hl-lc-1 hl-text-muted">' +
        '<span>' + (a.type_name ? '<i class="hl-item-class">' + U.esc(a.type_name) + '</i>' : '') +
        (a.art_from ? '<i class="hl-item-watch">' + U.esc(a.art_from) + '</i>' : '') +
        '<i>' + (a.art_time ? new Date(a.art_time * 1000).toLocaleDateString() : '') + '</i></span>' +
        '</div></div></div></div></div>';
    },

    /** 分页 (widget/page.html) */
    page: function (page, pagecount, baseUrl) {
      if (!pagecount || pagecount <= 1) return '';
      const u = (p) => baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'page=' + p;
      let html = '<ul class="hl-page-wrap hl-text-center cleafix">';
      html += '<li class="hl-hide-sm"><a href="' + u(1) + '" class="' + (page === 1 ? 'hl-disad' : '') + '"><i class="iconfont hl-icon-jiantoushou"></i></a></li>';
      html += '<li><a href="' + u(Math.max(1, page - 1)) + '" class="' + (page === 1 ? 'hl-disad' : '') + '"><span class="hl-hide-sm"><i class="iconfont hl-icon-jiantouzuo"></i></span><span class="hl-hidden-xs">上一页</span></a></li>';

      const from = Math.max(1, page - 2), to = Math.min(pagecount, page + 2);
      if (from > 1) {
        html += '<li class="hl-hidden-xs"><a href="' + u(1) + '">1</a></li>';
        if (from > 2) html += '<li class="hl-hidden-xs hl-disad"><a class="hl-page-dot" href="javascript:;"><span>...</span></a></li>';
      }
      for (let i = from; i <= to; i++) {
        html += '<li class="hl-hidden-xs"><a href="' + (i === page ? 'javascript:;' : u(i)) + '" class="' + (i === page ? 'active' : '') + '">' + i + '</a></li>';
      }
      if (to < pagecount) {
        if (to < pagecount - 1) html += '<li class="hl-hidden-xs hl-disad"><a class="hl-page-dot" href="javascript:;"><span>...</span></a></li>';
        html += '<li class="hl-hidden-xs"><a href="' + u(pagecount) + '">' + pagecount + '</a></li>';
      }
      html += '<li class="hl-page-tips hl-hide-sm"><a href="javascript:;">' + page + '&nbsp;/&nbsp;' + pagecount + '</a></li>';
      html += '<li><a href="' + u(Math.min(pagecount, page + 1)) + '" class="' + (page === pagecount ? 'hl-disad' : '') + '"><span class="hl-hide-sm"><i class="iconfont hl-icon-jiantouyou"></i></span><span class="hl-hidden-xs">下一页</span></a></li>';
      html += '<li class="hl-hide-sm"><a href="' + u(pagecount) + '" class="' + (page === pagecount ? 'hl-disad' : '') + '"><i class="iconfont hl-icon-jiantouwei"></i></a></li>';
      html += '</ul>';
      return html;
    },
  };

  // ======================================================
  // 5. 公共交互
  // ======================================================
  const Interact = {
    /** 懒加载 (同时支持 img[data-original] 与背景图元素 [data-original]) */
    lazy: function (root) {
      const scope = root || document;
      const nodes = [];
      // 包含 root 自身（当传入单个元素时）
      if (scope.nodeType === 1 && scope.hasAttribute('data-original')) nodes.push(scope);
      scope.querySelectorAll('[data-original]').forEach(el => nodes.push(el));

      const load = (el) => {
        const src = el.getAttribute('data-original');
        if (!src) return;               // 地址尚未填充，跳过（下次调用再处理）
        if (el.dataset.loaded === '1') return;
        el.dataset.loaded = '1';

        if (el.tagName === 'IMG') {
          el.src = src;
          el.onerror = function () {
            this.onerror = null;
            const t = el.getAttribute('title') || '影';
            this.src = U.placeholder(t, U.hash(t));
          };
        } else {
          // 背景图元素：先探测可用性，失败则用占位图
          const probe = new Image();
          probe.onload = () => { el.style.backgroundImage = 'url("' + src + '")'; };
          probe.onerror = () => {
            const t = el.getAttribute('title') || '影';
            el.style.backgroundImage = 'url("' + U.placeholder(t, U.hash(t)) + '")';
          };
          probe.src = src;
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          el.style.backgroundRepeat = 'no-repeat';
        }
      };

      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              load(e.target);
              if (e.target.dataset.loaded === '1') io.unobserve(e.target);
            }
          });
        }, { rootMargin: '300px' });
        nodes.forEach(el => io.observe(el));
      } else {
        nodes.forEach(load);
      }
    },

    /** 播放线路切换 */
    bindTabs: function (root) {
      (root || document).querySelectorAll('.hl-tabs-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const btns = this.parentElement.querySelectorAll('.hl-tabs-btn');
          btns.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          const idx = Array.prototype.indexOf.call(btns, this);
          const boxes = document.querySelectorAll('.hl-tabs-box');
          boxes.forEach((box, i) => { box.style.display = i === idx ? 'block' : 'none'; });
        });
      });
    },

    /** 展开全部剧集 */
    bindShowAll: function (root) {
      (root || document).querySelectorAll('.hl-show-list').forEach(el => {
        el.addEventListener('click', function () {
          const list = this.closest('ul');
          if (!list) return;
          list.classList.toggle('hl-list-open');
          const em = this.querySelector('em');
          if (em) em.textContent = list.classList.contains('hl-list-open') ? '收起' : '展开全部';
        });
      });
    },

    /** 倒序排列剧集 */
    bindSort: function (root) {
      (root || document).querySelectorAll('.hl-sort-btn').forEach(el => {
        el.addEventListener('click', function () {
          const list = document.getElementById('hl-plays-list');
          if (!list) return;
          const items = Array.prototype.slice.call(list.querySelectorAll('li'));
          items.reverse().forEach(li => list.appendChild(li));
          const span = this.querySelector('span');
          if (span) span.textContent = list.dataset.reversed === '1' ? '正序' : '倒序';
          list.dataset.reversed = list.dataset.reversed === '1' ? '0' : '1';
        });
      });
    },

    /** 星级评分交互 */
    bindRating: function (root) {
      (root || document).querySelectorAll('.rating-star li').forEach(li => {
        li.addEventListener('mouseenter', function () {
          const list = this.parentElement;
          const idx = Array.prototype.indexOf.call(list.children, this);
          Array.prototype.forEach.call(list.children, (c, i) => {
            c.className = i <= idx ? 'big-star' : '';
          });
        });
        li.addEventListener('mouseleave', function () {
          Array.prototype.forEach.call(this.parentElement.children, c => { c.className = ''; });
        });
        li.addEventListener('click', function () {
          const idx = Array.prototype.indexOf.call(this.parentElement.children, this) + 1;
          try { localStorage.setItem('maccms_rating', String(idx)); } catch (e) {}
        });
      });
    },

    /** 观看历史 */
    history: {
      get: function () {
        try { return JSON.parse(localStorage.getItem('maccms_play_history') || '[]'); } catch (e) { return []; }
      },
      save: function (item) {
        let h = this.get().filter(x => x.vod_id !== item.vod_id);
        h.unshift(item);
        try { localStorage.setItem('maccms_play_history', JSON.stringify(h.slice(0, 20))); } catch (e) {}
      },
      progress: function (vodId, sid, nid) {
        const m = this.get().find(x => x.vod_id === vodId && x.sid === sid && x.nid === nid);
        return m ? m.time : 0;
      },
    },
  };

  // ======================================================
  // 6. 导出
  // ======================================================
  global.Theme = Theme;
  global.API = API;
  global.U = U;
  global.Card = Card;
  global.Interact = Interact;

  document.addEventListener('DOMContentLoaded', function () {
    Theme.restoreSkin();
    Interact.lazy();
    Interact.bindTabs();
    Interact.bindShowAll();
    Interact.bindSort();
    Interact.bindRating();
  });
})(window);
