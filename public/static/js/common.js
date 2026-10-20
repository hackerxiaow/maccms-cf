// ========================================================
// MacCMS 影院级 UI 公共脚本：图标系统 / 图片降级 / 工具方法
// ========================================================

/**
 * 海报图片降级方案：
 * 豆瓣等图床普遍有防盗链，外链直接 <img> 会失败变成裂图。
 * 这里统一用 onerror 兜底为「渐变底 + 影片首字」的 SVG DataURI，
 * 保证任何情况下页面都有完整可读的视觉，而非黑色空洞。
 */
window.MacArt = {
  /**
   * 生成占位封面 (DataURI SVG)
   * 设计为「电影胶片纹理 + 抽象光斑 + 标题」，
   * 避免出现巨大图标在放大后喧宾夺主。
   */
  placeholder(title = '影视', seed = 0) {
    const palettes = [
      ['#1d2a52', '#4a1d3d', '#ff2f56'],
      ['#0d3d40', '#122a4f', '#22d3ee'],
      ['#3d2a12', '#4a1d2d', '#f7c948'],
      ['#132a3d', '#331d1d', '#fb923c'],
      ['#241a4d', '#1d2a4d', '#a78bfa'],
      ['#3d1d2a', '#4d3d1d', '#f472b6'],
    ];
    const p = palettes[Math.abs(seed) % palettes.length];
    const ch = (title || '影').trim().charAt(0) || '影';
    const safeCh = ch.replace(/[<>&"']/g, '');
    const safeTitle = (title || '').slice(0, 14).replace(/[<>&"']/g, '');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stop-color="${p[0]}"/>
          <stop offset="100%" stop-color="${p[1]}"/>
        </linearGradient>
        <radialGradient id="glow" cx="30%" cy="26%" r="52%">
          <stop offset="0%" stop-color="${p[2]}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${p[2]}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="78%" cy="82%" r="46%">
          <stop offset="0%" stop-color="${p[2]}" stop-opacity="0.26"/>
          <stop offset="100%" stop-color="${p[2]}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="45%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.62"/>
        </linearGradient>
      </defs>
      <rect width="300" height="450" fill="url(#bg)"/>
      <rect width="300" height="450" fill="url(#glow)"/>
      <rect width="300" height="450" fill="url(#glow2)"/>
      <g opacity="0.1" fill="none" stroke="#ffffff" stroke-width="1.4">
        <path d="M-20 120 L320 40 M-20 200 L320 120 M-20 280 L320 200 M-20 360 L320 280 M-20 440 L320 360"/>
      </g>
      <rect width="300" height="450" fill="url(#fade)"/>
      <text x="150" y="228" font-size="118" font-weight="800" text-anchor="middle" fill="#ffffff" fill-opacity="0.2" font-family="PingFang SC, Microsoft YaHei, sans-serif">${safeCh}</text>
      <rect x="90" y="266" width="120" height="1.5" fill="${p[2]}" fill-opacity="0.6"/>
      <text x="150" y="300" font-size="15" font-weight="600" text-anchor="middle" fill="#ffffff" fill-opacity="0.72" font-family="PingFang SC, Microsoft YaHei, sans-serif">${safeTitle}</text>
    </svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  },

  /**
   * 绑定图片降级处理 (推荐用 onerror 内联调用)
   */
  fallback(img, title, seed = 0) {
    if (img && img.dataset.fallbackApplied) return;
    if (img) img.dataset.fallbackApplied = '1';
    const target = window.MacArt.placeholder(title, seed);
    if (img) {
      img.src = target;
      img.onerror = null;
    }
  },

  /**
   * 简易种子哈希
   */
  hash(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  },
};

/**
 * 内联 SVG 图标库 (避免依赖字体中的私有区字符，避免渲染成方块)
 */
window.MacIcon = {
  _cache: {},
  /**
   * @param {string} name 图标名
   * @param {number} size 像素尺寸
   * @param {string} color 颜色
   */
  svg(name, size = 18, color = 'currentColor') {
    const key = `${name}-${size}-${color}`;
    if (this._cache[key]) return this._cache[key];

    const paths = {
      logo: '<path d="M12 2 L20 7 L20 17 L12 22 L4 17 L4 7 Z" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12.5 L11 14.5 L15.5 10" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      play: '<path d="M7 4.5 L19 12 L7 19.5 Z" fill="COLOR"/>',
      search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="COLOR" stroke-width="1.8"/><path d="M16 16 L21 21" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
      history: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="COLOR" stroke-width="1.8"/><path d="M12 7.5 L12 12 L15.5 14" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      star: '<path d="M12 3 L14.9 9.3 L21.6 10.1 L16.8 14.8 L17.9 21.5 L12 18.3 L6.1 21.5 L7.2 14.8 L2.4 10.1 L9.1 9.3 Z" fill="COLOR"/>',
      settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="COLOR" stroke-width="1.8"/><path d="M12 2.5 L12 6 M12 18 L12 21.5 M2.5 12 L6 12 M18 12 L21.5 12 M5.2 5.2 L7.8 7.8 M16.2 16.2 L18.8 18.8 M18.8 5.2 L16.2 7.8 M7.8 16.2 L5.2 18.8" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
      film: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="COLOR" stroke-width="1.7"/><path d="M8 5 L8 19 M16 5 L16 19 M3 12 L21 12" stroke="COLOR" stroke-width="1.7"/>',
      grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="COLOR" stroke-width="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="COLOR" stroke-width="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="COLOR" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="COLOR" stroke-width="1.7"/>',
      folder: '<path d="M3 7.5 A2 2 0 0 1 5 5.5 L9 5.5 L11 8 L19 8 A2 2 0 0 1 21 10 L21 17 A2 2 0 0 1 19 19 L5 19 A2 2 0 0 1 3 17 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linejoin="round"/>',
      tag: '<path d="M3.5 11.5 L11.5 3.5 L20.5 3.5 L20.5 12.5 L12.5 20.5 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.5" cy="7.5" r="1.6" fill="COLOR"/>',
      zap: '<path d="M13.5 2.5 L5 13.5 L11 13.5 L10 21.5 L19 10 L13 10 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linejoin="round"/>',
      chat: '<path d="M4 5.5 A2 2 0 0 1 6 3.5 L18 3.5 A2 2 0 0 1 20 5.5 L20 14.5 A2 2 0 0 1 18 16.5 L9 16.5 L4 20.5 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linejoin="round"/>',
      link: '<path d="M10 13.5 A4 4 0 0 0 15.5 13 L19 9.5 A4 4 0 0 0 13.5 4 L11 6.5 M14 10.5 A4 4 0 0 0 8.5 11 L5 14.5 A4 4 0 0 0 10.5 20 L13 17.5" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round"/>',
      chart: '<path d="M4 20 L4 11 M9.3 20 L9.3 5 M14.6 20 L14.6 14 M20 20 L20 8" stroke="COLOR" stroke-width="2.4" stroke-linecap="round"/>',
      user: '<circle cx="12" cy="8" r="3.8" fill="none" stroke="COLOR" stroke-width="1.8"/><path d="M4.5 20 A7.5 7.5 0 0 1 19.5 20" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
      fire: '<path d="M12 2.5 C12 2.5 6 8 6 13 A6 6 0 0 0 18 13 C18 8 12 2.5 12 2.5 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 20 A3.2 3.2 0 0 0 15 17" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round"/>',
      bulb: '<path d="M9 18 L9 21 L15 21 L15 18 M9.5 18 L9.5 15 A5.5 5.5 0 1 1 14.5 15 L14.5 18 Z" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      expand: '<path d="M4 9 L4 4 L9 4 M15 4 L20 4 L20 9 M20 15 L20 20 L15 20 M9 20 L4 20 L4 15" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      external: '<path d="M14 4 L20 4 L20 10 M20 4 L12 12" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14 L18 19 A1.5 1.5 0 0 1 16.5 20.5 L5 20.5 A1.5 1.5 0 0 1 3.5 19 L3.5 7.5 A1.5 1.5 0 0 1 5 6 L10 6" fill="none" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
      logout: '<path d="M10 4 L5 4 A1.5 1.5 0 0 0 3.5 5.5 L3.5 18.5 A1.5 1.5 0 0 0 5 20 L10 20 M15 16 L20 12 L15 8 M20 12 L9 12" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      chevronLeft: '<path d="M14.5 5.5 L8 12 L14.5 18.5" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      chevronRight: '<path d="M9.5 5.5 L16 12 L9.5 18.5" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      refresh: '<path d="M20 12 A8 8 0 1 1 17 5.5 M20 3 L20 8 L15 8" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="COLOR" stroke-width="1.7"/><path d="M12 7.5 L12 12 L15.5 14" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    };

    const body = (paths[name] || paths.film).replace(/COLOR/g, color);
    const markup = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="display:block;flex-shrink:0;">${body}</svg>`;
    this._cache[key] = markup;
    return markup;
  },
};

/**
 * 全局替换：把页面中 [data-icon] 元素填充为对应 SVG
 */
window.MacIcon.renderAll = function (root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const size = parseInt(el.getAttribute('data-icon-size') || '18', 10);
    const color = el.getAttribute('data-icon-color') || 'currentColor';
    el.innerHTML = window.MacIcon.svg(name, size, color);
  });
};

/**
 * 为页面内所有带 data-fallback-title 的图片绑定降级
 */
window.MacArt.bindAll = function (root = document) {
  root.querySelectorAll('img[data-fallback-title]').forEach(img => {
    img.onerror = function () {
      window.MacArt.fallback(this, this.getAttribute('data-fallback-title'), window.MacArt.hash(this.getAttribute('data-fallback-title')));
    };
    // 已经加载失败的情况也补一次
    if (img.complete && img.naturalWidth === 0) {
      window.MacArt.fallback(img, img.getAttribute('data-fallback-title'), window.MacArt.hash(img.getAttribute('data-fallback-title')));
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.MacIcon.renderAll();
  window.MacArt.bindAll();
});
