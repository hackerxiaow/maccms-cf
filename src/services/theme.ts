// ========================================================
// 主题配置服务 (移植海螺影视 Conch_M003 主题的全局配置项)
// 所有配置以 key-value 形式存储于 theme_config 表，
// 前台页面在渲染时通过 /api/theme 一次性拉取并应用。
// ========================================================

import type { Bindings } from '../types/index.ts';

/** 配置分组定义（对应海螺主题 conchvip.php 的结构） */
export const THEME_GROUPS = [
  { key: 'general', title: '基础设置', icon: '⚙️' },
  { key: 'color', title: '配色与皮肤', icon: '🎨' },
  { key: 'home', title: '首页区块', icon: '🏠' },
  { key: 'nav', title: '导航与菜单', icon: '🧭' },
  { key: 'type', title: '分类与筛选', icon: '📂' },
  { key: 'detail', title: '详情页', icon: '🎬' },
  { key: 'play', title: '播放页', icon: '▶️' },
  { key: 'list', title: '列表与排行', icon: '📊' },
  { key: 'art', title: '资讯与专题', icon: '📰' },
] as const;

export type ThemeGroupKey = typeof THEME_GROUPS[number]['key'];

/**
 * 默认主题配置（对齐海螺 Conch_M003 v3.1 的 conchvip.php 默认值）
 */
export const DEFAULT_THEME: Record<string, { value: string; group: ThemeGroupKey; title: string; type: 'text' | 'color' | 'number' | 'switch' | 'textarea' }> = {
  // ---------- 基础设置 ----------
  'theme.logo': { value: '', group: 'general', title: '站点 LOGO 图片 (留空使用文字)', type: 'text' },
  'theme.style.color': { value: '0', group: 'general', title: '默认皮肤 (0=浅色 1=深色)', type: 'switch' },
  'theme.img.radius': { value: '10', group: 'general', title: '图片圆角 (px, 0=直角)', type: 'number' },
  'theme.style.custom': { value: '', group: 'general', title: '自定义 CSS', type: 'textarea' },
  'theme.script.custom': { value: '', group: 'general', title: '自定义 JS / 统计代码', type: 'textarea' },
  'theme.lazy': { value: '/static/theme/img/load.gif', group: 'general', title: '图片懒加载占位图', type: 'text' },

  // ---------- 配色 ----------
  'theme.color.site': { value: '#0099ff', group: 'color', title: '主色调', type: 'color' },
  'theme.color.subs': { value: '#00bbff', group: 'color', title: '辅助色调 (渐变副色)', type: 'color' },

  // ---------- 搜索 ----------
  'theme.search.tips': { value: '请输入片名、演员或导演', group: 'general', title: '搜索框占位提示', type: 'text' },
  'theme.search.suggest': { value: '1', group: 'general', title: '开启搜索联想', type: 'switch' },
  'theme.search.filter': { value: 'a,b,c', group: 'general', title: '搜索类型 (a=影视 b=文章 c=明星)', type: 'text' },

  // ---------- 封面显示 ----------
  'theme.cover.score': { value: '1', group: 'general', title: '封面显示评分', type: 'switch' },
  'theme.cover.tag': { value: '1', group: 'general', title: '封面显示角标标签', type: 'switch' },
  'theme.cover.wide': { value: '3', group: 'general', title: '宽封面分类 ID (逗号分隔)', type: 'text' },

  // ---------- 首页区块 ----------
  'home.banner.btn': { value: '1', group: 'home', title: '显示焦点图轮播', type: 'switch' },
  'home.banner.num1': { value: '9', group: 'home', title: '焦点图数量', type: 'number' },
  'home.banner.by': { value: 'time', group: 'home', title: '焦点图排序 (time/hits/score)', type: 'text' },
  'home.banner.order': { value: 'desc', group: 'home', title: '焦点图排序方向', type: 'text' },

  'home.meun.btn': { value: '1', group: 'home', title: '显示快捷导航', type: 'switch' },
  'home.meun.num': { value: '10', group: 'home', title: '快捷导航分类数', type: 'number' },

  'home.notice.btn': { value: '1', group: 'home', title: '显示网站公告', type: 'switch' },
  'home.notice.text': { value: '欢迎使用 MacCMS 影视 Serverless 版，基于 Cloudflare 边缘云原生架构构建。', group: 'home', title: '网站公告内容', type: 'textarea' },

  'home.hots.btn': { value: '1', group: 'home', title: '显示热播推荐', type: 'switch' },
  'home.hots.title': { value: '热播推荐', group: 'home', title: '热播推荐标题', type: 'text' },
  'home.hots.style': { value: 'c', group: 'home', title: '热播布局 (a=6卡 b=12卡 c=横向轮播)', type: 'text' },
  'home.hots.num': { value: '25', group: 'home', title: '热播推荐数量', type: 'number' },

  'home.weeks.btn': { value: '0', group: 'home', title: '显示每周更新', type: 'switch' },
  'home.weeks.title': { value: '每周更新', group: 'home', title: '每周更新标题', type: 'text' },
  'home.weeks.num': { value: '25', group: 'home', title: '每周更新数量', type: 'number' },

  'home.vod.btn': { value: '1', group: 'home', title: '显示分类影视区块', type: 'switch' },
  'home.vod.id': { value: '1,2,3,4,5', group: 'home', title: '首页影视分类 ID', type: 'text' },
  'home.vod.num': { value: '25', group: 'home', title: '每个分类展示数量', type: 'number' },
  'home.vod.v12': { value: '3', group: 'home', title: '12 卡布局的分类 ID', type: 'text' },
  'home.vod.vn': { value: '', group: 'home', title: '横向轮播布局的分类 ID', type: 'text' },
  'home.vod.rank': { value: '1', group: 'home', title: '分类区块显示侧栏排行榜', type: 'switch' },
  'home.vod.rank_id': { value: '1,2', group: 'home', title: '带排行榜的分类 ID', type: 'text' },
  'home.vod.rank_by': { value: 'hits_week', group: 'home', title: '排行榜排序 (hits/hits_day/hits_week/score)', type: 'text' },

  'home.topic.btn': { value: '1', group: 'home', title: '显示精彩专题', type: 'switch' },
  'home.topic.title': { value: '精彩专题', group: 'home', title: '专题区块标题', type: 'text' },
  'home.topic.num': { value: '4', group: 'home', title: '专题展示数量', type: 'number' },

  'home.art.btn': { value: '1', group: 'home', title: '显示最新资讯', type: 'switch' },
  'home.art.title': { value: '新闻头条', group: 'home', title: '资讯区块标题', type: 'text' },
  'home.art.num': { value: '6', group: 'home', title: '资讯展示数量', type: 'number' },

  'home.links.btn': { value: '1', group: 'home', title: '显示友情链接', type: 'switch' },
  'home.links.title': { value: '友情链接', group: 'home', title: '友链区块标题', type: 'text' },
  'home.links.num': { value: '50', group: 'home', title: '友链展示数量', type: 'number' },

  // ---------- 导航 ----------
  'nav.type.PC': { value: '1,2,3,4,5', group: 'nav', title: '顶部分类导航 (分类ID逗号分隔)', type: 'text' },
  'nav.type.mobile': { value: '1,5', group: 'nav', title: '移动端分类导航', type: 'text' },
  'nav.top.PC': { value: 'a,b,d,e,h', group: 'nav', title: '顶部图标 (a=观看记录 b=公众号 c=专题 d=最新 e=排行 f=自定义 h=用户中心)', type: 'text' },
  'nav.mid.PC': { value: '3,5', group: 'nav', title: '顶部扩展入口 (3=专题 5=留言 9=角色 10=剧情)', type: 'text' },
  'nav.aid.PC': { value: '2,7', group: 'nav', title: '辅助导航 (2=最新 7=排行 6=我的)', type: 'text' },
  'nav.bottom.PC': { value: 'a,b,c,e', group: 'nav', title: '底部图标 (a=二维码 b=皮肤 c=留言 d=自定义 e=返回顶部)', type: 'text' },
  'nav.custom.title': { value: '', group: 'nav', title: '自定义导航标题', type: 'text' },
  'nav.custom.link': { value: '', group: 'nav', title: '自定义导航链接', type: 'text' },

  // ---------- 分类与筛选 ----------
  'show.filter': { value: 'a,b,c,d,e', group: 'type', title: '全局筛选分组 (a=分类 b=类型 c=地区 d=年份 e=语言)', type: 'text' },
  'type.child.id': { value: '1,2', group: 'type', title: '使用子分类布局的分类 ID', type: 'text' },
  'type.area.id': { value: '3,4', group: 'type', title: '使用地区布局的分类 ID', type: 'text' },
  'type.vod.num': { value: '20', group: 'type', title: '分类页每页数量', type: 'number' },
  'type.vod.by': { value: 'time', group: 'type', title: '分类页排序', type: 'text' },
  'type.vod.order': { value: 'desc', group: 'type', title: '分类页排序方向', type: 'text' },
  'type.vod.style': { value: 'a', group: 'type', title: '分类页布局 (a=6卡 b=12卡 c=轮播)', type: 'text' },

  // ---------- 详情页 ----------
  'detail.bg.btn': { value: '0', group: 'detail', title: '详情页显示大图背景', type: 'switch' },
  'detail.play.btn': { value: '1', group: 'detail', title: '显示播放列表', type: 'switch' },
  'detail.down.btn': { value: '1', group: 'detail', title: '显示下载列表', type: 'switch' },
  'detail.content.btn': { value: '1', group: 'detail', title: '显示剧情简介', type: 'switch' },
  'detail.rel.btn': { value: '1', group: 'detail', title: '显示相关推荐', type: 'switch' },
  'detail.rel.title': { value: '相关视频', group: 'detail', title: '相关推荐标题', type: 'text' },
  'detail.score.btn': { value: '1', group: 'detail', title: '显示星级评分面板', type: 'switch' },
  'detail.vodside.title': { value: '排行榜', group: 'detail', title: '侧栏排行榜标题', type: 'text' },
  'detail.vodside.by': { value: 'hits', group: 'detail', title: '侧栏排行榜排序', type: 'text' },
  'detail.vodside.num': { value: '10', group: 'detail', title: '侧栏排行榜数量', type: 'number' },

  // ---------- 播放页 ----------
  'play.player.pc-high': { value: '56.25', group: 'play', title: 'PC 播放器高度比例 (%)', type: 'number' },
  'play.player.tips': { value: '1', group: 'play', title: '显示播放提示条', type: 'switch' },
  'play.player.notice': { value: '不要轻易相信视频中的广告，谨防上当受骗! 如果无法播放请重新刷新页面，或者切换线路。', group: 'play', title: '播放页滚动提醒', type: 'textarea' },
  'play.nostyle': { value: '0', group: 'play', title: '播放页暗色模式 (1=开)', type: 'switch' },
  'play.autonext': { value: '1', group: 'play', title: '自动连播下一集', type: 'switch' },

  // ---------- 列表与排行 ----------
  'list.rank.title': { value: '人气排行榜', group: 'list', title: '排行榜页标题', type: 'text' },
  'list.rank.id': { value: '1,2,3,4,16', group: 'list', title: '排行榜参与分类 ID', type: 'text' },
  'list.rank.num': { value: '50', group: 'list', title: '排行榜每类数量', type: 'number' },

  // ---------- 资讯与专题 ----------
  'art.index.title': { value: '最新资讯', group: 'art', title: '资讯列表页标题', type: 'text' },
  'art.index.num': { value: '20', group: 'art', title: '资讯列表每页数量', type: 'number' },
  'art.side.title': { value: '24小时热门', group: 'art', title: '资讯侧栏标题', type: 'text' },
  'art.side.num': { value: '5', group: 'art', title: '资讯侧栏数量', type: 'number' },
  'art.banner.btn': { value: '1', group: 'art', title: '资讯页显示焦点图', type: 'switch' },
  'art.detail.copyright': { value: '本文由网络整理 © 版权归原作者所有', group: 'art', title: '文章页版权声明', type: 'text' },
  'topic.index.title': { value: '精彩专题', group: 'art', title: '专题列表页标题', type: 'text' },
  'topic.index.num': { value: '12', group: 'art', title: '专题每页数量', type: 'number' },
  'topic.detail.new': { value: '1', group: 'art', title: '专题详情显示最新专题', type: 'switch' },

  // ---------- 播放器与全局 ----------
  'theme.tips.btn': { value: '1', group: 'general', title: '显示网站弹窗公告', type: 'switch' },
  'theme.tips.title': { value: '网站公告', group: 'general', title: '弹窗公告标题', type: 'text' },
  'theme.tips.content': { value: '本站只提供WEB页面服务，本站不存储、不制作任何视频，不承担任何由于内容的合法性及健康性所引起的争议和法律责任。', group: 'general', title: '弹窗公告内容', type: 'textarea' },
  'theme.copyright': { value: '应版权方要求，暂不提供相关资源', group: 'general', title: '版权限制提示', type: 'text' },
  'theme.lock': { value: '因特殊原因，该视频暂时无法观看', group: 'general', title: '锁定提示', type: 'text' },
};

export class ThemeService {
  /**
   * 获取全部主题配置（合并默认值与数据库覆盖值）
   */
  static async getAll(db: D1Database): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    // 先填默认值
    for (const [k, v] of Object.entries(DEFAULT_THEME)) {
      result[k] = v.value;
    }
    // 再用数据库值覆盖
    const rows = await db.prepare('SELECT cfg_key, cfg_value FROM theme_config').all<{
      cfg_key: string;
      cfg_value: string;
    }>();
    for (const r of rows.results || []) {
      result[r.cfg_key] = r.cfg_value;
    }
    return result;
  }

  /**
   * 获取带分组元信息的主题配置（供后台渲染表单）
   */
  static async getForAdmin(db: D1Database): Promise<{
    groups: typeof THEME_GROUPS;
    items: { key: string; value: string; group: string; title: string; type: string }[];
  }> {
    const values = await this.getAll(db);
    const items = Object.entries(DEFAULT_THEME).map(([key, meta]) => ({
      key,
      value: values[key] ?? meta.value,
      group: meta.group,
      title: meta.title,
      type: meta.type,
    }));
    return { groups: THEME_GROUPS, items };
  }

  /**
   * 保存主题配置（批量 upsert）
   */
  static async save(db: D1Database, entries: Record<string, string>): Promise<number> {
    let n = 0;
    for (const [key, val] of Object.entries(entries)) {
      if (!DEFAULT_THEME[key]) continue; // 仅允许写入已知配置项
      await db
        .prepare(
          `INSERT INTO theme_config (cfg_key, cfg_value, cfg_group, cfg_title, cfg_type)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(cfg_key) DO UPDATE SET cfg_value = ?`
        )
        .bind(
          key,
          String(val),
          DEFAULT_THEME[key].group,
          DEFAULT_THEME[key].title,
          DEFAULT_THEME[key].type,
          String(val)
        )
        .run();
      n++;
    }
    return n;
  }

  /**
   * 重置为默认配置
   */
  static async reset(db: D1Database, group?: string): Promise<void> {
    if (group) {
      const keys = Object.entries(DEFAULT_THEME)
        .filter(([, m]) => m.group === group)
        .map(([k]) => k);
      for (const k of keys) {
        await db.prepare('DELETE FROM theme_config WHERE cfg_key = ?').bind(k).run();
      }
    } else {
      await db.prepare('DELETE FROM theme_config').run();
    }
  }

  /**
   * 生成前端运行时主题 CSS 变量
   */
  static buildCssVars(cfg: Record<string, string>): string {
    const site = cfg['theme.color.site'] || '#0099ff';
    const subs = cfg['theme.color.subs'] || '#00bbff';
    const radius = parseInt(cfg['theme.img.radius'] || '10', 10) || 0;

    const radiusCss = radius > 0
      ? `
.conch-content .hl-row-box .hl-item-thumb,
.conch-content .hl-vod-rank .hl-rank-box,
.conch-content .hl-detail-side,
.conch-content .hl-row-box .hl-topic-list .hl-item-wrap:after,
.conch-content .hl-row-box .hl-topic-list .hl-item-wrap:before,
.conch-ads-box { border-radius:${radius}px; }
.conch-content .hl-vod-rank .hl-rank-list .hl-item-thumb,
.conch-content .hl-new-items .hl-item-thumb { border-radius:${Math.max(1, Math.round(radius / 2))}px; }`
      : '';

    return `:root{
  --hl-site:${site};
  --hl-subs:${subs};
  --hl-radius:${radius}px;
  --tx:#222222;
  --tx-dim:#555555;
  --tx-mute:#777777;
}
[data-skin="black"]{
  --tx:#e6e8ed;
  --tx-dim:#a6abb8;
  --tx-mute:#757c8d;
}
[data-skin="white"]{
  --tx:#222222;
  --tx-dim:#555555;
  --tx-mute:#777777;
}
/* 以下主题色映射严格对应原版 public/include.html 的 color 区块 */
.conch-content .hl-row-box .hl-site-tabs a.active,
.conch-content .hl-tool-icon a.disabled,
.conch-content .hl-type-name a.active,
.conch-header .conch-menus ul>li>a.active,
.conch-header .conch-menus ul>li>a.active>i,
.conch-results li strong,
.hl-btn-border,
.hl-text-conch { color:${site}; }

.conch-banner .swiper-pagination-bullet-active,
.conch-content .hl-play-source .hl-plays-from a.active:after,
.conch-content .hl-play-source .hl-plays-list li>a>em::after,
.conch-content .hl-play-source .hl-plays-list li>a>em::before,
.conch-content .hl-row-box .hl-actor-sm li.active .hl-item-link:after,
.conch-content .hl-row-box .hl-pic-tag span,
.conch-content .hl-row-box .hl-site-tabs a.active::after,
.conch-footer .hl-foot-extra .hl-fe-list a span,
.conch-header .conch-menus ul>li>a.active em,
.hl-bg-conch,
.hl-page-wrap li a.active { background:${site}; }

.conch-content .hl-conch-items,
.conch-content .hl-row-box .hl-actor-sm li.active .hl-item-link,
.conch-content .hl-row-box .hl-rb-title i,
.conch-content .hl-row-box .hl-week-item .hl-tabs-btn.active,
.conch-content .hl-smnav-home .hl-smnav-item a>i,
.conch-header .conch-hasconch,
.hl-btn-gradient {
  background:${site};
  background:-webkit-linear-gradient(left,${site},${subs});
  background:linear-gradient(90deg,${site},${subs});
}

.conch-content .hl-row-box .hl-rb-title i,
.conch-content .hl-smnav-home .hl-smnav-item a>i {
  color:transparent !important;
  -webkit-background-clip:text !important;
}

.hl-page-wrap li a.active { color:#fff; }
.hl-pic-tag span { color:#fff; }
.hl-play-btn { background:linear-gradient(90deg,${site},${subs}); }
.hl-comm-submit { background:${site}; }
.hl-search-submit { background:${site}; }
.hl-smnav-item a { background:linear-gradient(90deg,${site},${subs}) !important; }
.hl-item-title a:hover,.hl-text-hover:hover { color:${site}; }
.hl-play-active { background:${site}; }
.hl-banner-main { background:linear-gradient(135deg,${site},${subs}); }
${radiusCss}
${cfg['theme.style.custom'] || ''}`;
  }
}
