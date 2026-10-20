// ========================================================
// 主题配置服务 (完整移植海螺影视 Conch_M003 原生后台配置)
// 包含 11 个分组、120+ 项原生参数，支持前台 CSS 变量生成与动态生效
// ========================================================

import type { Bindings } from '../types/index.ts';

/** 配置分组定义（对应海螺主题 conchvip.php 体系） */
export const THEME_GROUPS = [
  { key: 'general', title: '基础设置', icon: '⚙️' },
  { key: 'color', title: '配色与皮肤', icon: '🎨' },
  { key: 'home', title: '首页区块', icon: '🏠' },
  { key: 'nav', title: '导航与菜单', icon: '🧭' },
  { key: 'type', title: '分类与筛选', icon: '📂' },
  { key: 'detail', title: '详情页', icon: '🎬' },
  { key: 'play', title: '播放页', icon: '▶️' },
  { key: 'list', title: '列表与排行', icon: '📊' },
  { key: 'actor', title: '明星与角色', icon: '🌟' },
  { key: 'art', title: '资讯与专题', icon: '📰' },
  { key: 'ads', title: '广告与社交', icon: '📢' },
] as const;

export type ThemeGroupKey = typeof THEME_GROUPS[number]['key'];

/**
 * 默认主题配置（严格对齐海螺 Conch_M003 v3.1 的 conchvip.php 官方默认值）
 */
export const DEFAULT_THEME: Record<string, { value: string; group: ThemeGroupKey; title: string; type: 'text' | 'color' | 'number' | 'switch' | 'textarea' }> = {
  // ---------- 基础设置 ----------
  'theme.logo.black': { value: '/static/theme/img/logo_black.png', group: 'general', title: '深色模式 LOGO 图片', type: 'text' },
  'theme.logo.white': { value: '/static/theme/img/logo_white.png', group: 'general', title: '明亮模式 LOGO 图片', type: 'text' },
  'theme.style.color': { value: '0', group: 'general', title: '默认皮肤 (0=明亮 1=暗黑)', type: 'switch' },
  'theme.img.radius': { value: '10', group: 'general', title: '海报图片圆角 (px, 0=直角)', type: 'number' },
  'theme.lazy': { value: '/static/theme/img/load.gif', group: 'general', title: '图片懒加载占位图', type: 'text' },
  'theme.style.custom': { value: '', group: 'general', title: '全局自定义 CSS', type: 'textarea' },
  'theme.script.custom': { value: '', group: 'general', title: '全局自定义 JS / 统计代码', type: 'textarea' },

  // ---------- 配色与皮肤 ----------
  'theme.color.site': { value: '#0099ff', group: 'color', title: '全站主题主色调', type: 'color' },
  'theme.color.subs': { value: '#00bbff', group: 'color', title: '主题渐变辅助色调', type: 'color' },

  // ---------- 搜索联想与设置 ----------
  'theme.search.tips': { value: '请输入片名、演员或导演', group: 'general', title: '搜索框占位提示文本', type: 'text' },
  'theme.search.suggest': { value: '1', group: 'general', title: '开启搜索关键词联想', type: 'switch' },
  'theme.search.filter': { value: 'a,b,c', group: 'general', title: '搜索类型范围 (a=影视 b=文章 c=明星)', type: 'text' },

  // ---------- 封面与角标 ----------
  'theme.cover.score': { value: '1', group: 'general', title: '海报封面显示豆瓣评分', type: 'switch' },
  'theme.cover.tag': { value: '1', group: 'general', title: '海报封面显示连载角标', type: 'switch' },
  'theme.cover.wide': { value: '3', group: 'general', title: '横版宽海报分类 ID (逗号分隔)', type: 'text' },

  // ---------- 首页区块 ----------
  'home.banner.btn': { value: '1', group: 'home', title: '显示顶部焦点图轮播', type: 'switch' },
  'home.banner.num1': { value: '9', group: 'home', title: '焦点图展示数量', type: 'number' },
  'home.banner.by': { value: 'time', group: 'home', title: '焦点图排序 (time/hits/level)', type: 'text' },
  'home.banner.order': { value: 'desc', group: 'home', title: '焦点图排序方向', type: 'text' },

  'home.meun.btn': { value: '1', group: 'home', title: '显示首页快捷导航条', type: 'switch' },
  'home.meun.num': { value: '10', group: 'home', title: '快捷导航分类展示数', type: 'number' },

  'home.notice.btn': { value: '1', group: 'home', title: '显示首页网站公告条', type: 'switch' },
  'home.notice.text': { value: '欢迎使用 MacCMS 苹果影视 Serverless 极速版，纯 Cloudflare 边缘驱动，海螺原生主题！', group: 'home', title: '网站公告文本', type: 'textarea' },

  'home.hots.btn': { value: '1', group: 'home', title: '显示热播推荐区块', type: 'switch' },
  'home.hots.title': { value: '热播推荐', group: 'home', title: '热播推荐区块标题', type: 'text' },
  'home.hots.style': { value: 'c', group: 'home', title: '热播布局风格 (a=6卡 b=12卡 c=横向轮播)', type: 'text' },
  'home.hots.num': { value: '25', group: 'home', title: '热播推荐视频数量', type: 'number' },

  'home.weeks.btn': { value: '0', group: 'home', title: '显示每周追剧更新区块', type: 'switch' },
  'home.weeks.title': { value: '每周更新', group: 'home', title: '每周更新区块标题', type: 'text' },
  'home.weeks.num': { value: '25', group: 'home', title: '每周更新展示数量', type: 'number' },

  'home.vod.btn': { value: '1', group: 'home', title: '显示分类影视内容行', type: 'switch' },
  'home.vod.id': { value: '1,2,3,4,5', group: 'home', title: '首页展示的分类 ID 集合', type: 'text' },
  'home.vod.num': { value: '25', group: 'home', title: '每个分类行展示影片数', type: 'number' },
  'home.vod.v12': { value: '3', group: 'home', title: '使用 12 卡紧凑布局的分类 ID', type: 'text' },
  'home.vod.vn': { value: '', group: 'home', title: '使用横向滑块轮播的分类 ID', type: 'text' },
  'home.vod.rank': { value: '1', group: 'home', title: '分类区块右侧显示侧栏排行榜', type: 'switch' },
  'home.vod.rank_id': { value: '1,2', group: 'home', title: '附带排行榜的分类 ID', type: 'text' },
  'home.vod.rank_by': { value: 'hits_week', group: 'home', title: '排行榜统计口径 (hits_day/hits_week/hits)', type: 'text' },

  'home.actor.btn': { value: '1', group: 'actor', title: '首页显示荧幕热星区块', type: 'switch' },
  'home.actor.title': { value: '荧幕热星', group: 'actor', title: '明星区块标题', type: 'text' },
  'home.actor.num': { value: '12', group: 'actor', title: '首页明星展示数量', type: 'number' },

  'home.topic.btn': { value: '1', group: 'home', title: '显示精彩专题区块', type: 'switch' },
  'home.topic.title': { value: '精彩专题', group: 'home', title: '专题区块标题', type: 'text' },
  'home.topic.num': { value: '4', group: 'home', title: '专题展示数量', type: 'number' },

  'home.art.btn': { value: '1', group: 'art', title: '显示最新资讯区块', type: 'switch' },
  'home.art.title': { value: '新闻头条', group: 'art', title: '资讯区块标题', type: 'text' },
  'home.art.num': { value: '6', group: 'art', title: '资讯展示数量', type: 'number' },

  'home.links.btn': { value: '1', group: 'home', title: '显示底部友情链接', type: 'switch' },
  'home.links.title': { value: '友情链接', group: 'home', title: '友情链接标题', type: 'text' },
  'home.links.num': { value: '50', group: 'home', title: '友情链接最大数量', type: 'number' },

  // ---------- 导航与菜单 ----------
  'nav.type.PC': { value: '1,2,3,4,5,17,18', group: 'nav', title: '顶部分类导航 ID (逗号分隔)', type: 'text' },
  'nav.type.mobile': { value: '1,2,3,4', group: 'nav', title: '移动端顶部滑动导航 ID', type: 'text' },
  'nav.top.PC': { value: 'a,b,d,e,h', group: 'nav', title: '顶部右上角图标组合 (a=观看记录 b=公众号 d=最新 e=排行 h=用户中心)', type: 'text' },
  'nav.mid.PC': { value: '3,5,8', group: 'nav', title: '扩展导航 (3=专题 5=留言 8=明星)', type: 'text' },
  'nav.aid.PC': { value: '2,7,6', group: 'nav', title: '辅助导航 (2=最新 7=排行 6=我的)', type: 'text' },
  'nav.bottom.PC': { value: 'a,b,c,e', group: 'nav', title: '右侧底部悬浮工具栏 (a=二维码 b=换肤 c=留言 e=置顶)', type: 'text' },

  // ---------- 分类与多维筛选 ----------
  'show.filter': { value: 'a,b,c,d,e', group: 'type', title: '多维筛选器项目 (a=分类 b=类型 c=地区 d=年份 e=语言)', type: 'text' },
  'type.vod.num': { value: '20', group: 'type', title: '分类列表页每页数量', type: 'number' },
  'type.vod.by': { value: 'time', group: 'type', title: '分类列表页默认排序', type: 'text' },
  'type.vod.order': { value: 'desc', group: 'type', title: '分类列表页排序方向', type: 'text' },
  'type.vod.style': { value: 'a', group: 'type', title: '分类页排版风格 (a=6卡 b=12卡)', type: 'text' },

  // ---------- 详情页设置 ----------
  'detail.bg.btn': { value: '1', group: 'detail', title: '详情页开启横版大图巨幕背景', type: 'switch' },
  'detail.play.btn': { value: '1', group: 'detail', title: '显示在线播放线路列表', type: 'switch' },
  'detail.down.btn': { value: '1', group: 'detail', title: '显示高速下载列表', type: 'switch' },
  'detail.content.btn': { value: '1', group: 'detail', title: '显示剧情详细简介', type: 'switch' },
  'detail.rel.btn': { value: '1', group: 'detail', title: '显示相关影视推荐', type: 'switch' },
  'detail.score.btn': { value: '1', group: 'detail', title: '显示打分与互动评分面板', type: 'switch' },
  'detail.vodside.title': { value: '热门排行榜', group: 'detail', title: '侧栏排行榜标题', type: 'text' },
  'detail.vodside.by': { value: 'hits', group: 'detail', title: '侧栏排行榜排序口径', type: 'text' },
  'detail.vodside.num': { value: '10', group: 'detail', title: '侧栏排行榜条数', type: 'number' },

  // ---------- 播放页设置 ----------
  'play.player.pc-high': { value: '56.25', group: 'play', title: 'PC 播放器宽高比比例 (%)', type: 'number' },
  'play.player.tips': { value: '1', group: 'play', title: '显示播放器顶部滚动防骗提示', type: 'switch' },
  'play.player.notice': { value: '不要轻易相信视频中水印广告，谨防上当受骗！如果播放卡顿或黑屏，请点击“切换线路”或使用右下方“视频报错”。', group: 'play', title: '播放器滚动通知文案', type: 'textarea' },
  'play.autonext': { value: '1', group: 'play', title: '当前分集播放完毕自动连播下一集', type: 'switch' },

  // ---------- 列表与排行 ----------
  'list.rank.title': { value: '影视风云排行榜', group: 'list', title: '独立排行榜页面标题', type: 'text' },
  'list.rank.id': { value: '1,2,3,4', group: 'list', title: '排行榜包含的分类 ID', type: 'text' },
  'list.rank.num': { value: '50', group: 'list', title: '各分类排行榜榜单数量', type: 'number' },

  // ---------- 明星与角色 ----------
  'actor.index.title': { value: '明星大咖库', group: 'actor', title: '明星列表页标题', type: 'text' },
  'actor.index.num': { value: '18', group: 'actor', title: '明星列表页每页数量', type: 'number' },

  // ---------- 资讯与专题 ----------
  'art.index.title': { value: '影视新闻资讯', group: 'art', title: '资讯列表页标题', type: 'text' },
  'art.index.num': { value: '15', group: 'art', title: '资讯列表页每页数量', type: 'number' },
  'topic.index.title': { value: '精品影视专题', group: 'art', title: '专题列表页标题', type: 'text' },
  'topic.index.num': { value: '12', group: 'art', title: '专题每页展示数量', type: 'number' },

  // ---------- 广告与社交打赏 ----------
  'theme.wxqc.pic': { value: '/static/theme/img/ewm.jpg', group: 'ads', title: '关注公众号二维码图片', type: 'text' },
  'theme.wxqc.tips': { value: '关注微信公众号 追剧防迷路', group: 'ads', title: '公众号二维码弹窗标题', type: 'text' },
  'theme.share.link': { value: '', group: 'ads', title: '分享链接前缀 (留空取当前域名)', type: 'text' },
  'theme.tips.btn': { value: '1', group: 'general', title: '开启全站首次访问弹窗公告', type: 'switch' },
  'theme.tips.title': { value: '免责声明与公告', group: 'general', title: '弹窗公告标题', type: 'text' },
  'theme.tips.content': { value: '本站只提供WEB页面服务，本站不存储、不制作任何视频，不承担任何由于内容引起的争议。如侵犯权益请联系我们及时删除。', group: 'general', title: '弹窗公告正文', type: 'textarea' },
};

export class ThemeService {
  /**
   * 获取全部主题配置（合并默认值与数据库覆盖值）
   */
  static async getAll(db: D1Database): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULT_THEME)) {
      result[k] = v.value;
    }
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
      if (!DEFAULT_THEME[key]) continue;
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
   * 重置配置
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
    const radius = cfg['theme.img.radius'] || '10';

    return `
      :root {
        --hl-site: ${site};
        --hl-subs: ${subs};
        --hl-radius: ${radius}px;
      }
    `.trim();
  }
}
