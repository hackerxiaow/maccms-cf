// ========================================================
// 海螺模板公共布局渲染器 (对应原版 public/head.html、public/menus.html、public/foot.html)
// 供所有页面复用，保证顶部导航 / 全部分类抽屉 / 页脚与原生模板结构逐类名一致
// ========================================================
(function (global) {
  'use strict';

  var LOGO_BLACK = '/static/theme/img/logo_black.png';
  var LOGO_WHITE = '/static/theme/img/logo_white.png';

  var Layout = {
    /** 渲染顶部导航（原版 public/head.html 结构） */
    header: function (activeKey) {
      var host = document.getElementById('siteHeader');
      if (!host) return;

      host.innerHTML =
        '<div id="conch-header" class="conch-header">' +
        '  <div class="conch-headwrap">' +
        '    <div class="container">' +
        '      <div class="conch-logo">' +
        '        <a class="hl-logo hl-logo-black" href="/" style="background-image: url(' + LOGO_BLACK + ');"></a>' +
        '        <a class="hl-logo hl-logo-white" href="/" style="background-image: url(' + LOGO_WHITE + ');"></a>' +
        '      </div>' +
        '      <div class="conch-list conch-content">' +
        '        <ul class="hl-list hl-text-muted clearfix">' +
        '          <li class="hl-list-font hl-hidden-xs"><a href="/user.html" title="会员中心"><i class="iconfont hl-icon-yonghu"></i></a></li>' +
        '          <li class="hl-list-font hl-hidden-xs"><a href="/gbook.html" title="求片留言"><i class="iconfont hl-icon-liuyan"></i></a></li>' +
        '          <li class="hl-list-font hl-hidden-xs"><a href="/actor.html" title="明星大咖"><i class="iconfont hl-icon-mingxing"></i></a></li>' +
        '          <li class="hl-list-font hl-hidden-xs"><a href="/rank.html" title="排行"><i class="iconfont hl-icon-paihang"></i></a></li>' +
        '          <li class="hl-list-font hl-hidden-xs"><a href="/admin/index.html" title="管理后台"><i class="iconfont hl-icon-shezhi"></i></a></li>' +
        '        </ul>' +
        '      </div>' +
        '      <div class="conch-search">' +
        '        <div class="hl-search-form">' +
        '          <input type="text" id="searchInput" class="hl-search-text hl-search-wd" placeholder="请输入片名、演员或导演" autocomplete="off">' +
        '          <button class="hl-search-submit" type="button" id="btnSearch"><i class="iconfont hl-icon-sousuo"></i></button>' +
        '        </div>' +
        '        <div class="hl-sh-box" id="suggestBox"></div>' +
        '      </div>' +
        '      <div class="conch-nav">' +
        '        <div class="hl-nav-wrap hl-navswiper">' +
        '          <ul class="hl-nav hl-text-site swiper-wrapper clearfix" id="mainNav"></ul>' +
        '        </div>' +
        '        <div class="hl-nav-more">' +
        '          <i class="hl-mbg hl-hide-sm"></i>' +
        '          <a class="hl-text-site hl-open-menu" href="javascript:;" id="btnOpenMenu"><span class="hl-hidden-xs">全部</span><i class="iconfont hl-icon-caidan"></i></a>' +
        '        </div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="conch-menus hl-bg-site hl-tran5" id="conchMenus">' +
        '    <div class="conch-ms-header">' +
        '      <div class="conch-logo">' +
        '        <a class="hl-logo hl-logo-black" href="/" style="background-image: url(' + LOGO_BLACK + ');"></a>' +
        '        <a class="hl-logo hl-logo-white" href="/" style="background-image: url(' + LOGO_WHITE + ');"></a>' +
        '      </div>' +
        '      <a class="conch-ms-close hl-text-muted" href="javascript:;" id="btnCloseMenu"><i class="iconfont hl-icon-cuo"></i></a>' +
        '    </div>' +
        '    <div class="conch-scrollbar">' +
        '      <ul class="hl-menus clearfix" id="drawerMenuList"></ul>' +
        '    </div>' +
        '  </div>' +
        '  <div class="conch-ms-overlay" id="menuOverlay"></div>' +
        '</div>';

      this.nav(activeKey);
      this.bindChrome();
    },

    /** 渲染导航与抽屉菜单 */
    nav: function (activeKey) {
      var nav = document.getElementById('mainNav');
      var drawer = document.getElementById('drawerMenuList');
      if (!nav) return;

      var items = [
        { key: 'home', title: '首页', url: '/', icon: 'hl-icon-shouye' },
        { key: 'actor', title: '明星', url: '/actor.html', icon: 'hl-icon-mingxing' },
        { key: 'live', title: '直播', url: '/live.html', icon: 'hl-icon-dianshiju3' },
        { key: 'manga', title: '漫画', url: '/manga.html', icon: 'hl-icon-dianshiju3' },
        { key: 'topic', title: '专题', url: '/topic.html', icon: 'hl-icon-zhuanti' },
        { key: 'art', title: '资讯', url: '/art.html', icon: 'hl-icon-xinwen' },
        { key: 'latest', title: '最新', url: '/type.html?by=time', icon: 'hl-icon-zuixin' },
        { key: 'rank', title: '排行', url: '/rank.html', icon: 'hl-icon-paihang' },
        { key: 'gbook', title: '留言', url: '/gbook.html', icon: 'hl-icon-liuyan' },
        { key: 'website', title: '网址', url: '/website.html', icon: 'hl-icon-lianjie' }
      ];

      var typeIds = [];
      try {
        typeIds = String(Theme.get('nav.type.PC', '1,2,3,4,5')).split(',').map(Number);
      } catch (e) {}

      API.get('/api/types').then(function (j) {
        var types = (j && j.code === 0 && j.data) ? j.data : [];

        // 顶部一级导航
        var html = '';
        items.slice(0, 1).forEach(function (it) {
          html += '<li class="hl-nav-item hl-slide-swiper"><a href="' + it.url + '"' +
            (activeKey === it.key ? ' class="hl-text-conch active"' : '') + '>' + it.title + '</a></li>';
        });
        types.forEach(function (t) {
          if (typeIds.indexOf(t.type_id) >= 0) {
            html += '<li class="hl-nav-item hl-slide-swiper"><a href="/type.html?id=' + t.type_id + '"' +
              (activeKey === 'type_' + t.type_id ? ' class="hl-text-conch active"' : '') + '>' +
              U.esc(t.type_name) + '</a></li>';
          }
        });
        items.slice(1).forEach(function (it) {
          html += '<li class="hl-nav-item hl-slide-swiper"><a href="' + it.url + '"' +
            (activeKey === it.key ? ' class="hl-text-conch active"' : '') + '>' + it.title + '</a></li>';
        });
        nav.innerHTML = html;

        // 抽屉全部分类
        if (drawer) {
          var d = '<li class="hl-menus-item"><a href="/"' + (activeKey === 'home' ? ' class="active"' : '') +
            '><i class="iconfont hl-icon-shouye"></i><span>首页</span></a></li>';
          types.forEach(function (t) {
            d += '<li class="hl-menus-item"><a href="/type.html?id=' + t.type_id +
              '"><i class="iconfont hl-icon-dianshiju3"></i><span>' + U.esc(t.type_name) + '</span></a></li>';
          });
          d += '<li class="hl-menus-item"><a href="/actor.html"><i class="iconfont hl-icon-mingxing"></i><span>明星图谱</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/live.html"><i class="iconfont hl-icon-dianshiju3"></i><span>电视直播</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/manga.html"><i class="iconfont hl-icon-dianshiju3"></i><span>漫画连载</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/topic.html"><i class="iconfont hl-icon-zhuanti"></i><span>精彩专题</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/art.html"><i class="iconfont hl-icon-xinwen"></i><span>新闻资讯</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/rank.html"><i class="iconfont hl-icon-paihang"></i><span>风云榜单</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/gbook.html"><i class="iconfont hl-icon-liuyan"></i><span>求片留言</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/website.html"><i class="iconfont hl-icon-lianjie"></i><span>网址导航</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/user.html"><i class="iconfont hl-icon-yonghu"></i><span>会员中心</span></a></li>';
          d += '<li class="hl-menus-item"><a href="/admin/index.html"><i class="iconfont hl-icon-shezhi"></i><span>管理后台</span></a></li>';
          drawer.innerHTML = d;
        }
      });
    },

    /** 绑定搜索 / 抽屉 / 皮肤 */
    bindChrome: function () {
      var input = document.getElementById('searchInput');
      if (input) {
        input.placeholder = Theme.get('theme.search.tips', '请输入片名、演员或导演');
        var go = function () {
          var kw = (input.value || '').trim();
          if (kw) location.href = '/search.html?wd=' + encodeURIComponent(kw);
        };
        var btn = document.getElementById('btnSearch');
        if (btn) btn.addEventListener('click', go);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });

        if (Theme.on('theme.search.suggest', true)) {
          var timer = null;
          input.addEventListener('input', function () {
            clearTimeout(timer);
            var v = (input.value || '').trim();
            var box = document.getElementById('suggestBox');
            if (!box) return;
            if (!v) { box.innerHTML = ''; return; }
            timer = setTimeout(function () {
              API.get('/api/vod/suggest', { wd: v }).then(function (j) {
                if (!j || j.code !== 0 || !j.data || !j.data.length) { box.innerHTML = ''; return; }
                box.innerHTML = '<ul class="hl-search-list">' + j.data.map(function (n) {
                  return '<li><a href="javascript:;" data-wd="' + U.esc(n) + '">' + U.esc(n) + '</a></li>';
                }).join('') + '</ul>';
              });
            }, 180);
          });
          document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('.hl-search-list a');
            if (a) location.href = '/search.html?wd=' + encodeURIComponent(a.getAttribute('data-wd'));
          });
        }
      }

      var openMenu = document.getElementById('btnOpenMenu');
      var closeMenu = document.getElementById('btnCloseMenu');
      var overlay = document.getElementById('menuOverlay');
      if (openMenu) openMenu.addEventListener('click', function () {
        document.getElementById('conchMenus').classList.add('active');
        if (overlay) overlay.style.display = 'block';
      });
      var closeAll = function () {
        var m = document.getElementById('conchMenus');
        if (m) m.classList.remove('active');
        if (overlay) overlay.style.display = 'none';
      };
      if (closeMenu) closeMenu.addEventListener('click', closeAll);
      if (overlay) overlay.addEventListener('click', closeAll);
    },

    /** 渲染页脚（原版 public/foot.html 结构） */
    footer: function () {
      var host = document.getElementById('siteFooter');
      if (!host) return;

      host.innerHTML =
        '<div id="conch-footer" class="conch-footer">' +
        '  <div class="conch-footwrap hl-bg-subs hl-footnav-show">' +
        '    <div class="container">' +
        '      <div class="hl-footwrap-item">' +
        '        <div class="hl-foot-extra">' +
        '          <ul class="hl-fe-list clearfix">' +
        '            <li class="hl-color-item"><a href="javascript:;" id="skinToggle"><i class="iconfont hl-icon-yueliang"></i><span id="skinText">深色模式</span></a></li>' +
        '            <li class="hl-back-item"><a class="hl-back-top" href="javascript:window.scrollTo({top:0,behavior:\'smooth\'});"><i class="iconfont hl-icon-jiantoushang"></i><span>返回顶部</span></a></li>' +
        '          </ul>' +
        '        </div>' +
        '        <div class="row">' +
        '          <div class="hl-col-sm-8 hl-col-xs-12">' +
        '            <div class="hl-foot-text hl-text-muted">' +
        '              <p>本站只提供 WEB 页面服务，所有影视内容均由采集接口自动获取，本站不存储、不制作任何视频。</p>' +
        '              <p>基于 Cloudflare Workers + Pages + D1 边缘云原生架构构建 · 100% 兼容 MacCMS 8/10 协议</p>' +
        '            </div>' +
        '            <div class="hl-map-nav hl-text-site hl-hidden-xs">' +
        '              <a href="/">首页</a><span>—</span>' +
        '              <a href="/type.html">全部分类</a><span>—</span>' +
        '              <a href="/rank.html">排行榜</a><span>—</span>' +
        '              <a href="/actor.html">明星库</a><span>—</span>' +
        '              <a href="/topic.html">专题</a><span>—</span>' +
        '              <a href="/art.html">资讯</a><span>—</span>' +
        '              <a href="/gbook.html">留言求片</a><span>—</span>' +
        '              <a href="/website.html">网址导航</a><span>—</span>' +
        '              <a href="/user.html">会员中心</a><span>—</span>' +
        '              <a href="/api.php/provide/vod/?ac=list" target="_blank">资源接口</a><span>—</span>' +
        '              <a href="/admin/index.html">管理后台</a>' +
        '            </div>' +
        '          </div>' +
        '          <div class="hl-col-sm-4 hl-col-xs-12">' +
        '            <div class="hl-foot-logo">' +
        '              <a class="hl-logo hl-bright-0" href="/" style="background-image: url(' + LOGO_BLACK + ');"></a>' +
        '            </div>' +
        '            <div class="hl-foot-copy hl-text-muted">' +
        '              <p>&copy;&nbsp;2026&nbsp;MacCMS Serverless Edition · 海螺影视 Conch_M003</p>' +
        '            </div>' +
        '          </div>' +
        '        </div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      // 绑定换肤
      var skinToggle = document.getElementById('skinToggle');
      if (skinToggle) {
        var isDark = function () {
          return String(Theme.get('theme.style.color', '0')) === '1';
        };
        var updateText = function () {
          var t = document.getElementById('skinText');
          if (t) t.textContent = isDark() ? '浅色模式' : '深色模式';
        };
        updateText();
        skinToggle.addEventListener('click', function () {
          Theme.toggleSkin();
          updateText();
        });
      }
    },

    render: function (activeKey) {
      this.header(activeKey);
      this.footer();
    }
  };

  global.Layout = Layout;
})(window);
