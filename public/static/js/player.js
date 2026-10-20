// ========================================================
// MacCMS 播放器沙箱驱动引擎 (DPlayer + HLS.js + 智能第三方解析调度)
// ========================================================

class MacPlayerEngine {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.dp = null;
  }

  /**
   * 初始化并播放指定集数
   * @param {string} url 视频直链地址或需要解析的地址
   * @param {string} from 播放器编码 (如 dplayer, m3u8, iframe, parse 等)
   * @param {string} parseUrl 该播放器绑定的解析接口前缀
   * @param {function} onEnded 播放完成回调
   */
  play(url, from = 'dplayer', parseUrl = '', onEnded = null) {
    if (!this.container) return;
    this.destroy();

    const isDirectHls = url.includes('.m3u8') || from.includes('m3u8') || from === 'dplayer';
    const isDirectMp4 = url.includes('.mp4');

    // 1. 如果有解析接口，或者来源为解析/外链框架，则使用 iframe 隔离播放
    if (parseUrl && !isDirectHls && !isDirectMp4) {
      this.renderIframe(`${parseUrl}${encodeURIComponent(url)}`);
      return;
    }

    if (from === 'iframe') {
      this.renderIframe(url);
      return;
    }

    // 2. 直链 HLS / MP4 使用 DPlayer 极速硬解播放
    if (window.DPlayer) {
      try {
        this.dp = new DPlayer({
          container: this.container,
          autoplay: true,
          theme: '#ff3a59',
          loop: false,
          lang: 'zh-cn',
          screenshot: true,
          hotkey: true,
          preload: 'auto',
          volume: 0.8,
          video: {
            url: url,
            type: isDirectHls ? 'hls' : 'auto',
          },
        });

        if (onEnded && typeof onEnded === 'function') {
          this.dp.on('ended', onEnded);
        }
      } catch (err) {
        console.warn('DPlayer 初始化异常，降级至原生 HTML5 Video / Iframe:', err);
        this.renderNativeVideo(url);
      }
    } else {
      this.renderNativeVideo(url);
    }
  }

  renderIframe(src) {
    this.container.innerHTML = `
      <iframe
        src="${src}"
        width="100%"
        height="100%"
        frameborder="0"
        allowfullscreen="true"
        webkitallowfullscreen="true"
        mozallowfullscreen="true"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        style="width:100%;height:100%;border:none;background:#000;"
      ></iframe>
    `;
  }

  renderNativeVideo(url) {
    this.container.innerHTML = `
      <video
        src="${url}"
        controls
        autoplay
        style="width:100%;height:100%;background:#000;outline:none;"
      ></video>
    `;
  }

  destroy() {
    if (this.dp) {
      try {
        this.dp.destroy();
      } catch (e) {}
      this.dp = null;
    }
    this.container.innerHTML = '';
  }
}

window.MacPlayerEngine = MacPlayerEngine;
