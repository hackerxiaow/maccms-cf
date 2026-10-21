// Shared MacCMS video-site chrome for every page. Data routes and page widgets
// remain owned by the existing API-backed page scripts.
(function (global) {
  'use strict';

  var LOGO_BLACK = '/static/theme/img/logo_black.png';
  var LOGO_WHITE = '/static/theme/img/logo_white.png';

  var Layout = {
    header: function (activeKey) {
      var host = document.getElementById('siteHeader');
      if (!host) return;
      host.innerHTML =
        '<header id="conch-header" class="site-header">' +
        '  <div class="site-header-inner">' +
        '    <div class="site-header-main">' +
        '      <a class="site-brand" href="/" aria-label="返回首页">' +
        '        <span class="site-brand-mark">苹</span>' +
        '        <span class="site-brand-copy"><strong id="siteBrandName">MacCMS 影视</strong><small>Cloudflare Video</small></span>' +
        '      </a>' +
        '      <div class="site-search">' +
        '        <div class="site-search-form">' +
        '          <input type="search" id="searchInput" class="site-search-input" placeholder="请输入片名、演员或导演" autocomplete="off" aria-label="搜索影视、演员或导演">' +
        '          <button class="site-search-submit" type="button" id="btnSearch" aria-label="搜索">⌕</button>' +
        '        </div>' +
        '        <div class="hl-sh-box" id="suggestBox"></div>' +
        '      </div>' +
        '      <div class="site-header-actions">' +
        '        <a class="site-account-button" href="/user.html" aria-label="会员中心" title="会员中心"><i class="iconfont hl-icon-huiyuan" aria-hidden="true"></i></a>' +
        '        <button class="site-icon-button" type="button" id="skinToggleHeader" data-skin-toggle aria-label="切换深色模式" title="切换深色模式"><span id="skinIconHeader">◐</span></button>' +
        '        <button class="site-menu-button" type="button" id="btnOpenMenu" aria-label="打开全部导航" aria-expanded="false">☰</button>' +
        '      </div>' +
        '    </div>' +
        '    <div class="site-nav-row">' +
        '      <nav class="site-primary-nav" aria-label="主导航，可横向滑动"><ul id="mainNav"></ul></nav>' +
        '      <div class="site-nav-tools" aria-label="快捷导航"><a href="/type.html?by=time">最新</a><a href="/rank.html">排行</a></div>' +
        '    </div>' +
        '  </div>' +
        '  </header>' +
        '  <aside class="site-drawer" id="conchMenus" aria-label="全部导航" aria-hidden="true">' +
        '    <div class="site-drawer-head"><a class="site-brand" href="/"><span class="site-brand-mark">苹</span><span class="site-brand-copy"><strong id="drawerSiteName">MacCMS 影视</strong><small>内容导航</small></span></a><button type="button" class="site-drawer-close" id="btnCloseMenu" aria-label="关闭导航">×</button></div>' +
        '    <div class="site-drawer-scroll"><ul class="site-drawer-list" id="drawerMenuList"></ul></div>' +
        '  </aside>' +
        '  <div class="site-drawer-overlay" id="menuOverlay"></div>';

      this.nav(activeKey);
      this.bindChrome();
      API.get('/api/config').then(function (result) {
        var name = result && result.code === 0 && result.data ? result.data.site_name : '';
        if (!name) return;
        var brand = document.getElementById('siteBrandName');
        var drawerName = document.getElementById('drawerSiteName');
        if (brand) brand.textContent = name;
        if (drawerName) drawerName.textContent = name;
      }).catch(function () {});
    },

    nav: function (activeKey) {
      var nav = document.getElementById('mainNav');
      var drawer = document.getElementById('drawerMenuList');
      if (!nav) return;

      var fixedItems = [
        { key: 'home', title: '首页', url: '/', icon: '⌂' },
        { key: 'latest', title: '最新', url: '/type.html?by=time', icon: '◷' },
        { key: 'actor', title: '明星', url: '/actor.html', icon: '✦' },
        { key: 'role', title: '角色', url: '/role.html', icon: '♙' },
        { key: 'live', title: '直播', url: '/live.html', icon: '▣' },
        { key: 'manga', title: '漫画', url: '/manga.html', icon: '▤' },
        { key: 'topic', title: '专题', url: '/topic.html', icon: '◈' },
        { key: 'art', title: '资讯', url: '/art.html', icon: '▧' },
        { key: 'plot', title: '剧情', url: '/plot.html', icon: '▶' },
        { key: 'rank', title: '排行', url: '/rank.html', icon: '↗' },
        { key: 'gbook', title: '求片', url: '/gbook.html', icon: '✉' },
        { key: 'website', title: '网址', url: '/website.html', icon: '↗' },
      ];
      var topPageKeys = ['actor', 'role', 'live', 'manga', 'topic', 'plot', 'gbook'];

      API.get('/api/types').then(function (result) {
        var types = result && result.code === 0 && Array.isArray(result.data) ? result.data : [];
        var home = fixedItems.filter(function (item) { return item.key === 'home'; });
        var videoTypes = types.filter(function (type) {
          return Number(type.type_mid) === 1;
        }).map(function (type) {
          return { key: 'type_' + type.type_id, title: type.type_name, url: '/type.html?id=' + Number(type.type_id), icon: '▱' };
        });
        var primaryPages = fixedItems.filter(function (item) { return topPageKeys.indexOf(item.key) >= 0; });
        var links = home.concat(videoTypes, primaryPages);
        nav.innerHTML = links.map(function (item) {
          var active = activeKey === item.key || (item.key === 'type_' + new URLSearchParams(location.search).get('id') && location.pathname === '/type.html');
          return '<li class="site-nav-item"><a href="' + item.url + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + U.esc(item.title) + '</a></li>';
        }).join('');

        if (drawer) {
          var drawerItems = [fixedItems[0]];
          types.forEach(function (type) {
            drawerItems.push({ key: 'type_' + type.type_id, title: type.type_name, url: '/type.html?id=' + Number(type.type_id), icon: '▱', child: false });
            (Array.isArray(type.children) ? type.children : []).forEach(function (child) {
              drawerItems.push({ key: 'type_' + child.type_id, title: child.type_name, url: '/type.html?id=' + Number(child.type_id), icon: '↳', child: true });
            });
          });
          drawerItems = drawerItems.concat(fixedItems.filter(function (item) { return item.key !== 'home'; }));
          drawerItems.push({ key: 'member', title: '会员中心', url: '/user.html', icon: '♙' });
          drawerItems.push({ key: 'admin', title: '管理后台', url: '/admin/index.html', icon: '⚙' });
          drawer.innerHTML = drawerItems.map(function (item) {
            return '<li><a class="site-drawer-link' + (item.child ? ' site-drawer-link--child' : '') + (activeKey === item.key ? ' active' : '') + '" href="' + item.url + '"><span aria-hidden="true">' + U.esc(item.icon) + '</span>' + U.esc(item.title) + '</a></li>';
          }).join('');
        }
      }).catch(function () {
        nav.innerHTML = fixedItems.slice(0, 1).map(function (item) { return '<li class="site-nav-item"><a href="/">首页</a></li>'; }).join('');
      });
    },

    bindChrome: function () {
      var input = document.getElementById('searchInput');
      var searchButton = document.getElementById('btnSearch');
      if (input) {
        input.placeholder = Theme.get('theme.search.tips', '请输入片名、演员或导演');
        var go = function () {
          var keyword = (input.value || '').trim();
          if (keyword) location.href = '/search.html?wd=' + encodeURIComponent(keyword);
        };
        if (searchButton) searchButton.addEventListener('click', go);
        input.addEventListener('keydown', function (event) { if (event.key === 'Enter') go(); });
        if (Theme.on('theme.search.suggest', true)) {
          var timer = null;
          input.addEventListener('input', function () {
            clearTimeout(timer);
            var keyword = (input.value || '').trim();
            var box = document.getElementById('suggestBox');
            if (!box) return;
            if (!keyword) { box.innerHTML = ''; return; }
            timer = setTimeout(function () {
              API.get('/api/vod/suggest', { wd: keyword }).then(function (result) {
                if (!result || result.code !== 0 || !result.data || !result.data.length) { box.innerHTML = ''; return; }
                box.innerHTML = '<ul class="hl-search-list">' + result.data.map(function (name) {
                  return '<li><a href="/search.html?wd=' + encodeURIComponent(name) + '">' + U.esc(name) + '</a></li>';
                }).join('') + '</ul>';
              }).catch(function () { box.innerHTML = ''; });
            }, 180);
          });
        }
      }

      var openButton = document.getElementById('btnOpenMenu');
      var closeButton = document.getElementById('btnCloseMenu');
      var overlay = document.getElementById('menuOverlay');
      var drawer = document.getElementById('conchMenus');
      var closeMenu = function () {
        if (drawer) { drawer.classList.remove('active'); drawer.setAttribute('aria-hidden', 'true'); }
        if (overlay) overlay.style.display = 'none';
        if (openButton) openButton.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('site-menu-open');
      };
      if (openButton) openButton.addEventListener('click', function () {
        if (drawer) { drawer.classList.add('active'); drawer.setAttribute('aria-hidden', 'false'); }
        if (overlay) overlay.style.display = 'block';
        openButton.setAttribute('aria-expanded', 'true');
        document.body.classList.add('site-menu-open');
      });
      if (closeButton) closeButton.addEventListener('click', closeMenu);
      if (overlay) overlay.addEventListener('click', closeMenu);
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(); });

      if (!document.body.dataset.skinToggleBound) {
        document.body.dataset.skinToggleBound = '1';
        document.body.addEventListener('click', function (event) {
          var button = event.target.closest && event.target.closest('[data-skin-toggle]');
          if (!button) return;
          event.preventDefault();
          Theme.toggleSkin();
          Layout.syncSkinControls();
        });
      }
      this.syncSkinControls();
      this.bindBackToTop();
      this.bindNavigationDrag();
    },

    bindNavigationDrag: function () {
      var nav = document.querySelector('.site-primary-nav');
      if (!nav || nav.dataset.dragBound) return;
      nav.dataset.dragBound = '1';
      var pointerId = null;
      var startX = 0;
      var startScroll = 0;
      var dragged = false;
      var suppressClick = false;

      nav.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScroll = nav.scrollLeft;
        dragged = false;
      });
      document.addEventListener('pointermove', function (event) {
        if (pointerId === null || event.pointerId !== pointerId) return;
        var delta = event.clientX - startX;
        if (Math.abs(delta) < 4 && !dragged) return;
        dragged = true;
        nav.classList.add('is-dragging');
        nav.scrollLeft = startScroll - delta;
        event.preventDefault();
      });
      document.addEventListener('pointerup', function (event) {
        if (pointerId === null || event.pointerId !== pointerId) return;
        pointerId = null;
        nav.classList.remove('is-dragging');
        if (dragged) {
          suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 0);
        }
      });
      nav.addEventListener('click', function (event) {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
    },

    syncSkinControls: function () {
      var dark = String(Theme.get('theme.style.color', '0')) === '1';
      var label = dark ? '切换浅色模式' : '切换深色模式';
      document.querySelectorAll('[data-skin-toggle]').forEach(function (button) {
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      });
      var headerIcon = document.getElementById('skinIconHeader');
      var footerIcon = document.getElementById('skinIconFooter');
      var footerText = document.getElementById('skinText');
      if (headerIcon) headerIcon.textContent = dark ? '☀' : '◐';
      if (footerIcon) footerIcon.textContent = dark ? '☀' : '◐';
      if (footerText) footerText.textContent = dark ? '切换浅色模式' : '切换深色模式';
    },

    bindBackToTop: function () {
      var button = document.getElementById('backToTop');
      if (!button || button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      window.addEventListener('scroll', function () { button.classList.toggle('visible', window.scrollY > 500); }, { passive: true });
    },

    footer: function () {
      var host = document.getElementById('siteFooter');
      if (!host) return;
      host.innerHTML =
        '<footer id="conch-footer" class="site-footer">' +
        '  <div class="site-footer-inner">' +
        '    <div class="site-footer-top"><a class="site-brand" href="/"><span class="site-brand-mark">苹</span><span class="site-brand-copy"><strong id="siteFooterName">MacCMS 影视</strong><small>Cloudflare Video</small></span></a>' +
        '      <div class="site-footer-tools"><button type="button" id="skinToggle" data-skin-toggle><span id="skinIconFooter" aria-hidden="true">◐</span> <span id="skinText">切换深色模式</span></button>' +
        '        <label for="contentLanguage">内容语言</label><select id="contentLanguage" aria-label="内容语言"><option value="zh-CN">中文</option><option value="en-US">English</option><option value="ja-JP">日本語</option></select></div></div>' +
        '    <nav class="site-footer-links" aria-label="页脚导航">' +
        '      <a href="/">首页</a><a href="/type.html">全部分类</a><a href="/rank.html">排行榜</a><a href="/actor.html">明星</a><a href="/role.html">角色</a><a href="/plot.html">分集剧情</a><a href="/topic.html">专题</a><a href="/art.html">资讯</a><a href="/live.html">直播</a><a href="/manga.html">漫画</a><a href="/gbook.html">留言求片</a><a href="/website.html">网址导航</a><a href="/user.html">会员中心</a><a href="/admin/index.html">管理后台</a></nav>' +
        '    <div class="site-footer-copy"><span>本站只提供网页服务，影视内容来自已配置的资源接口。</span><span>© 2026 <b id="siteFooterCopyName">MacCMS Serverless</b></span></div>' +
        '  </div>' +
        '</footer><button id="backToTop" class="site-back-top" type="button" aria-label="返回顶部" title="返回顶部">↑</button>';

      var languageSelect = document.getElementById('contentLanguage');
      if (languageSelect) {
        try { languageSelect.value = localStorage.getItem('maccms_content_language') || 'zh-CN'; } catch (e) {}
        languageSelect.addEventListener('change', function () {
          try {
            if (languageSelect.value === 'zh-CN') localStorage.removeItem('maccms_content_language');
            else localStorage.setItem('maccms_content_language', languageSelect.value);
          } catch (e) {}
          location.reload();
        });
      }
      this.syncSkinControls();
      this.bindBackToTop();
      API.get('/api/config').then(function (result) {
        var name = result && result.code === 0 && result.data ? result.data.site_name : '';
        if (!name) return;
        var footerName = document.getElementById('siteFooterName');
        var copyName = document.getElementById('siteFooterCopyName');
        if (footerName) footerName.textContent = name;
        if (copyName) copyName.textContent = name;
      }).catch(function () {});
    },

    render: function (activeKey) {
      if (!document.querySelector('link[rel="manifest"]')) {
        var manifest = document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = '/manifest.webmanifest';
        document.head.appendChild(manifest);
      }
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      }
      this.header(activeKey);
      this.footer();
    },
  };

  global.Layout = Layout;
})(window);
