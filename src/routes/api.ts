// ========================================================
// 现代 RESTful API 路由 (供前端页面、小程序与移动端 App 调用)
// 包含视频、会员、鉴权、明星角色、留言报错、广告位全量端点
// ========================================================

import { Hono } from 'hono';
import type { Bindings } from '../types/index.ts';
import { VodService } from '../services/vod.ts';
import { UserService } from '../services/user.ts';
import { CardService } from '../services/card.ts';
import { ActorService } from '../services/actor.ts';
import { GbookService } from '../services/gbook.ts';
import { AdsService } from '../services/ads.ts';
import { ThemeService } from '../services/theme.ts';
import { AuthUtils } from '../utils/auth.ts';
import { WebsiteService } from '../services/website.ts';
import { MangaService } from '../services/manga.ts';
import { deleteStoredMedia, loadMediaStorageConfig, uploadToTelegraph, uploadToTelegram } from './cloud-admin.ts';
import { clearRateLimit, consumeRateLimit, MemberSecurityService } from '../services/member-security.ts';
import { SearchService } from '../services/search.ts';
import { PaymentService } from '../services/payment.ts';
import { WebPushService } from '../services/web-push.ts';
import { ContentTranslationService } from '../services/content-translation.ts';

export const apiRouter = new Hono<{ Bindings: Bindings }>();

const sanitizeVodPublic = <T extends Record<string, any>>(item: T, hidePlotDetail = false): Omit<T, never> => {
  const safe = { ...item } as Record<string, any>;
  for (const key of ['vod_play_url','vod_down_url','vod_pwd','vod_pwd_play','vod_pwd_down','vod_pwd_url','vod_pwd_play_url','vod_pwd_down_url']) delete safe[key];
  if (hidePlotDetail) delete safe.vod_plot_detail;
  return safe as Omit<T, never>;
};

const sanitizeArtPublic = <T extends Record<string, any>>(item: T, includeContent = false): T => {
  const safe = { ...item };
  delete (safe as Record<string, any>).art_pwd;
  delete (safe as Record<string, any>).art_pwd_url;
  if (!includeContent) delete (safe as Record<string, any>).art_content;
  return safe;
};

// 0. 主题配置接口 (前台页面启动时一次性拉取，用于应用配色/圆角/区块开关)
apiRouter.get('/theme', async (c) => {
  const cfg = await ThemeService.getAll(c.env.DB);
  return c.json({
    code: 0,
    msg: 'ok',
    data: {
      config: cfg,
      cssVars: ThemeService.buildCssVars(cfg),
    },
  }, 200, {
    'Cache-Control': 'public, max-age=30',
  });
});

// 1. 视频列表接口 (支持分类/年代/地区/首字母多重筛选与排序)
apiRouter.get('/vod/list', async (c) => {
  const query = c.req.query();
  const page = parseInt(query.page || '1', 10);
  const limit = parseInt(query.limit || '18', 10);
  const typeId = query.type_id ? parseInt(query.type_id, 10) : undefined;
  const year = query.year;
  const area = query.area;
  const wd = query.wd;
  const letter = query.letter;
  const by = (query.by as any) || 'time';
  const order = (query.order as any) || 'desc';

  let data: Awaited<ReturnType<typeof VodService.queryVods>>;
  let searchMode = 'sql';
  const indexEligible = Boolean(wd && !typeId && !year && !area && !letter && !query.vod_class && !query.vod_lang
    && !query.version && !query.state && !query.tag && !query.actor && !query.director && query.weekday === undefined);
  if (indexEligible && await SearchService.isConfigured(c.env.DB)) {
    try {
      const matches = await SearchService.query(c.env.DB, 'vod', wd!, page, Math.min(100, Math.max(1, limit)));
      const lookup = await VodService.queryVods(c.env.DB, { page: 1, limit: Math.max(1, matches.ids.length), ids: matches.ids, status: 1 });
      const byId = new Map(lookup.list.map((item) => [item.vod_id, item]));
      const ordered = matches.ids.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      data = { list: ordered, total: matches.total, page, limit, pagecount: Math.ceil(matches.total / limit) };
      searchMode = 'meilisearch';
    } catch (error) {
      console.error('Meilisearch video query failed; using D1 search:', error);
      data = await VodService.queryVods(c.env.DB, {
        page, limit, typeId, year, area, wd, letter, by, order, status: 1,
        vodClass: query.vod_class, vodLang: query.vod_lang, version: query.version, state: query.state,
        tag: query.tag, actor: query.actor, director: query.director,
        weekday: query.weekday !== undefined ? parseInt(query.weekday, 10) : undefined,
      });
    }
  } else {
    data = await VodService.queryVods(c.env.DB, {
      page, limit, typeId, year, area, wd, letter, by, order, status: 1,
      vodClass: query.vod_class, vodLang: query.vod_lang, version: query.version, state: query.state,
      tag: query.tag, actor: query.actor, director: query.director,
      weekday: query.weekday !== undefined ? parseInt(query.weekday, 10) : undefined,
    });
  }
  if (wd) await SearchService.record(c.env.DB, wd, data.total, searchMode).catch(() => {});

  return c.json({
    code: 0,
    msg: 'ok',
    data: { ...data, list: (await ContentTranslationService.apply(c.env.DB, 'vod', data.list, query.lang)).map((item) => sanitizeVodPublic(item)) },
  });
});

// 1.1 分类筛选维度字典 (供海螺主题的多维筛选器使用)
apiRouter.get('/vod/filters/:typeId', async (c) => {
  const typeId = parseInt(c.req.param('typeId'), 10);
  const db = c.env.DB;

  const rows = await db
    .prepare('SELECT type_id, type_pid, type_extend FROM type WHERE type_id = ? OR type_pid = ?')
    .bind(typeId, typeId)
    .all<{ type_id: number; type_pid: number; type_extend: string }>();

  let extend: Record<string, string[]> = {};
  for (const r of rows.results || []) {
    if (r.type_extend) {
      try {
        const parsed = JSON.parse(r.type_extend);
        extend = { ...extend, ...parsed };
      } catch (e) {}
    }
  }

  const [years, areas, langs, classes] = await Promise.all([
    db.prepare('SELECT DISTINCT vod_year AS v FROM vod WHERE vod_status = 1 AND vod_year <> "" ORDER BY vod_year DESC LIMIT 40').all<{ v: string }>(),
    db.prepare('SELECT DISTINCT vod_area AS v FROM vod WHERE vod_status = 1 AND vod_area <> "" LIMIT 40').all<{ v: string }>(),
    db.prepare('SELECT DISTINCT vod_lang AS v FROM vod WHERE vod_status = 1 AND vod_lang <> "" LIMIT 40').all<{ v: string }>(),
    db.prepare('SELECT DISTINCT vod_class AS v FROM vod WHERE vod_status = 1 AND vod_class <> "" LIMIT 40').all<{ v: string }>(),
  ]);

  const split = (list: any[]) =>
    list.flatMap(r => String(r.v || '').split(/[,，\/]/).map(s => s.trim()).filter(Boolean));

  return c.json({
    code: 0,
    msg: 'ok',
    data: {
      extend,
      years: Array.from(new Set(split(years.results || []))).sort((a, b) => b.localeCompare(a)),
      areas: Array.from(new Set(split(areas.results || []))),
      langs: Array.from(new Set(split(langs.results || []))),
      classes: Array.from(new Set(split(classes.results || []))),
      states: ['连载', '完结'],
      letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('0-9'),
    },
  });
});

// 2. 巨幕轮播推荐 (Banner Spotlight - 支持动态 limit)
apiRouter.get('/vod/banners', async (c) => {
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') || '9', 10)));
  const data = await VodService.getBannerVods(c.env.DB, limit);
  return c.json({ code: 0, msg: 'ok', data: data.map((item) => sanitizeVodPublic(item)) });
});

// 3. 影视排行榜
apiRouter.get('/vod/rankings', async (c) => {
  const limit = Math.min(30, Math.max(1, parseInt(c.req.query('limit') || '10', 10)));
  const data = await VodService.getRankings(c.env.DB, limit);
  return c.json({ code: 0, msg: 'ok', data });
});

// 4. 视频详情接口 (包含完整解析好的多线路与选集列表)
apiRouter.get('/vod/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id) || id <= 0) {
    return c.json({ code: 400, msg: '无效的视频 ID' }, 400);
  }

  const detail = await VodService.getVodDetail(c.env.DB, id, { publishedOnly: true, countHit: true });
  if (!detail) {
    return c.json({ code: 404, msg: '视频不存在或已下架' }, 404);
  }

  const protectedPlay = Number(detail.group_id || 0) > 1 || Number(detail.vod_points || 0) > 0 ||
    Number(detail.vod_points_play || 0) > 0 || !!detail.vod_pwd || !!detail.vod_pwd_play;
  const protectedDownload = Number(detail.group_id || 0) > 1 || Number(detail.vod_points || 0) > 0 ||
    Number(detail.vod_points_down || 0) > 0 || !!detail.vod_pwd || !!detail.vod_pwd_down;
  const playGroups = detail.play_groups.map((group) => ({
    ...group,
    urls: group.urls.map((episode) => ({ ...episode, url: protectedPlay ? '' : episode.url })),
  }));
  const downGroups = detail.down_groups.map((group) => ({
    ...group,
    urls: group.urls.map((episode) => ({ ...episode, url: protectedDownload ? '' : episode.url })),
  }));
  const { vod_play_url, vod_down_url, vod_pwd, vod_pwd_play, vod_pwd_down, ...safeDetail } = detail;
  const localized = await ContentTranslationService.apply(c.env.DB, 'vod', [{ ...safeDetail, play_groups: playGroups, down_groups: downGroups }], c.req.query('lang'));
  return c.json({ code: 0, msg: 'ok', data: localized[0] });
});

// 5. 搜索联想补全接口
apiRouter.get('/vod/suggest', async (c) => {
  const wd = c.req.query('wd') || '';
  const suggestions = await VodService.getSuggestions(c.env.DB, wd, 8);
  return c.json({ code: 0, msg: 'ok', data: suggestions });
});

// Unified public search across the content models used by MacCMS.
apiRouter.get('/search/all', async (c) => {
  const wd = String(c.req.query('wd') || '').trim().slice(0, 100);
  if (wd.length < 1) return c.json({ code: 400, msg: '请输入搜索关键词' }, 400);
  const limit = Math.min(20, Math.max(1, Number(c.req.query('limit')) || 12));
  const pattern = `%${wd}%`;
  const [vod, art, actors, roles, websites, manga, topics] = await Promise.all([
    VodService.queryVods(c.env.DB, { page: 1, limit, wd, status: 1 }),
    VodService.queryArts(c.env.DB, { page: 1, limit, wd, status: 1 }),
    ActorService.queryActors(c.env.DB, { page: 1, limit, wd }),
    ActorService.queryRoles(c.env.DB, { page: 1, limit, wd }),
    WebsiteService.query(c.env.DB, { page: 1, limit, wd, status: 1 }),
    MangaService.query(c.env.DB, { page: 1, limit, wd, status: 1 }),
    c.env.DB.prepare(`SELECT topic_id,topic_name,topic_pic,topic_blurb,topic_time FROM topic
      WHERE topic_status=1 AND (topic_name LIKE ? OR topic_blurb LIKE ? OR topic_content LIKE ?)
      ORDER BY topic_level DESC,topic_sort ASC,topic_time DESC LIMIT ?`).bind(pattern, pattern, pattern, limit).all(),
  ]);
  const safeManga = (item: any) => {
    const { manga_chapter_url, manga_pwd, manga_pwd_url, manga_content, ...safe } = item;
    return safe;
  };
  return c.json({ code: 0, msg: 'ok', data: {
    wd,
    vod: { total: vod.total, list: vod.list.map((item) => sanitizeVodPublic(item)) },
    art: { total: art.total, list: art.list.map((item) => sanitizeArtPublic(item)) },
    actor: { total: actors.total, list: actors.list.map(({ actor_id, actor_name, actor_pic, actor_area, actor_works }) => ({ actor_id, actor_name, actor_pic, actor_area, actor_works })) },
    role: { total: roles.total, list: roles.list.map(({ role_id, role_name, role_pic, role_actor_name, role_vod_name }) => ({ role_id, role_name, role_pic, role_actor_name, role_vod_name })) },
    website: { total: websites.total, list: websites.list.map(({ website_id, website_name, website_logo, website_pic, website_url, type_name }) => ({ website_id, website_name, website_logo, website_pic, website_url, type_name })) },
    manga: { total: manga.total, list: manga.list.map(safeManga) },
    topic: { list: topics.results || [] },
  } });
});

// 6. 顶踩与评分
apiRouter.post('/vod/digg', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = parseInt(body.id, 10);
  const type = body.type === 'down' ? 'down' : 'up';
  if (!id) return c.json({ code: 400, msg: '参数错误' }, 400);
  const res = await VodService.diggVod(c.env.DB, id, type);
  return c.json({ code: 0, msg: '感谢您的评价', data: res });
});

apiRouter.post('/vod/score', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = parseInt(body.id, 10);
  const score = parseFloat(body.score || '9.0');
  if (!id) return c.json({ code: 400, msg: '参数错误' }, 400);
  const res = await VodService.scoreVod(c.env.DB, id, score);
  return c.json({ code: 0, msg: '评分成功', data: res });
});

// 7. 点播鉴权核验
apiRouter.post('/vod/check_play', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vodId = parseInt(body.vod_id, 10);
  const nid = parseInt(body.nid || '1', 10);
  if (!Number.isInteger(vodId) || vodId <= 0 || !Number.isInteger(nid) || nid < 1) {
    return c.json({ code: 400, msg: '影片或集数参数无效' }, 400);
  }

  const userId = await getUserFromHeader(c);
  const res = await UserService.checkPlayPermission(c.env.DB, userId, vodId, nid, false);
  return c.json({ code: res.canPlay ? 0 : 403, data: res });
});

// 受限播放/下载地址只在服务端完成权限检查后单集返回，详情接口不下发原始地址。
apiRouter.post('/vod/resolve', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vodId = Number(body.vod_id);
  const sid = Number(body.sid);
  const nid = Number(body.nid);
  const mode = body.mode === 'download' ? 'download' : 'play';
  if (![vodId, sid, nid].every(Number.isInteger) || vodId <= 0 || sid < 0 || nid < 0) {
    return c.json({ code: 400, msg: '影片、线路或集数参数无效' }, 400);
  }
  const detail = await VodService.getVodDetail(c.env.DB, vodId, { publishedOnly: true });
  if (!detail) return c.json({ code: 404, msg: '视频不存在或已下架' }, 404);
  const groups = mode === 'download' ? detail.down_groups : detail.play_groups;
  const group = groups[sid];
  const episode = group?.urls[nid];
  if (!group || !episode?.url) return c.json({ code: 404, msg: '对应线路或集数不存在' }, 404);

  const requiredPassword = mode === 'download'
    ? String(detail.vod_pwd_down || detail.vod_pwd || '')
    : String(detail.vod_pwd_play || detail.vod_pwd || '');
  if (requiredPassword && String(body.password || '') !== requiredPassword) {
    return c.json({ code: 403, msg: `${mode === 'download' ? '下载' : '播放'}需要密码`, data: { password_required: true } }, 403);
  }
  const userId = await getUserFromHeader(c);
  const permission = mode === 'download'
    ? await UserService.checkDownloadPermission(c.env.DB, userId, vodId, nid + 1)
    : await UserService.checkPlayPermission(c.env.DB, userId, vodId, nid + 1, true);
  const canAccess = mode === 'download'
    ? (permission as { canDownload: boolean }).canDownload
    : (permission as { canPlay: boolean }).canPlay;
  if (!canAccess) return c.json({ code: 403, msg: permission.reason || '当前账号没有访问权限', data: permission }, 403);
  return c.json({ code: 0, data: {
    mode, vod_id: vodId, sid, nid, name: episode.name, from: episode.from || group.from,
    url: episode.url, trial_seconds: mode === 'play' ? Number((permission as { trialSeconds?: number }).trialSeconds || 0) : 0,
  } });
});

// 8. 分类树接口
apiRouter.get('/types', async (c) => {
  const mid = c.req.query('mid') ? parseInt(c.req.query('mid')!, 10) : undefined;
  const types = await VodService.getTypes(c.env.DB, mid);
  return c.json({ code: 0, msg: 'ok', data: types });
});

// 9. 文章资讯接口
apiRouter.get('/art/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '10', 10);
  const typeId = q.type_id ? parseInt(q.type_id, 10) : undefined;
  const wd = q.wd;
  let data: Awaited<ReturnType<typeof VodService.queryArts>>;
  let searchMode = 'sql';
  if (wd && !typeId && await SearchService.isConfigured(c.env.DB)) {
    try {
      const matches = await SearchService.query(c.env.DB, 'art', wd, page, Math.min(100, Math.max(1, limit)));
      const rows = matches.ids.length ? await c.env.DB.prepare(`SELECT a.*,t.type_name FROM art a LEFT JOIN type t ON t.type_id=a.type_id
        WHERE a.art_status=1 AND a.art_id IN (${matches.ids.map(() => '?').join(',')})`).bind(...matches.ids).all() : { results: [] };
      const byId = new Map((rows.results || []).map((item: any) => [Number(item.art_id), item]));
      const list = matches.ids.map((id) => byId.get(id)).filter(Boolean) as any[];
      data = { list, total: matches.total, page, limit, pagecount: Math.ceil(matches.total / limit) };
      searchMode = 'meilisearch';
    } catch (error) {
      console.error('Meilisearch article query failed; using D1 search:', error);
      data = await VodService.queryArts(c.env.DB, { page, limit, typeId, wd });
    }
  } else {
    data = await VodService.queryArts(c.env.DB, { page, limit, typeId, wd });
  }
  if (wd) await SearchService.record(c.env.DB, wd, data.total, searchMode).catch(() => {});
  const localized = await ContentTranslationService.apply(c.env.DB, 'art', data.list, q.lang);
  return c.json({ code: 0, msg: 'ok', data: { ...data, list: localized.map((item) => sanitizeArtPublic(item)) } });
});

apiRouter.get('/art/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getArtDetail(c.env.DB, id, true);
  if (!data) return c.json({ code: 404, msg: '文章不存在' }, 404);
  const localized = (await ContentTranslationService.apply(c.env.DB, 'art', [data], c.req.query('lang')))[0];
  const locked = Number(localized.group_id || 0) > 1 || Number(localized.art_points || 0) > 0 || !!localized.art_pwd;
  const safe = sanitizeArtPublic(localized, !locked);
  if (locked) safe.art_content = '';
  return c.json({ code: 0, msg: 'ok', data: { ...safe, access_locked: locked, password_required: !!data.art_pwd } });
});

apiRouter.post('/art/access/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '文章 ID 无效' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const permission = await UserService.checkArticlePermission(c.env.DB, await getUserFromHeader(c), id, String(body.password || ''), true);
  if (!permission.canRead) return c.json({ code: 403, msg: permission.reason || '当前账号无权阅读', data: permission }, 403);
  const article = await VodService.getArtDetail(c.env.DB, id, true);
  if (!article) return c.json({ code: 404, msg: '文章不存在或已下架' }, 404);
  const localized = (await ContentTranslationService.apply(c.env.DB, 'art', [article], String(body.lang || c.req.query('lang') || '')))[0];
  return c.json({ code: 0, msg: 'ok', data: sanitizeArtPublic(localized, true) });
});

// 10. 影视专题接口
apiRouter.get('/topic/list', async (c) => {
  const data = await VodService.queryTopics(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data: await ContentTranslationService.apply(c.env.DB, 'topic', data, c.req.query('lang')) });
});

apiRouter.get('/topic/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getTopicDetail(c.env.DB, id, true);
  if (!data) return c.json({ code: 404, msg: '专题不存在' }, 404);
  const localized = (await ContentTranslationService.apply(c.env.DB, 'topic', [data], c.req.query('lang')))[0];
  localized.vods = await ContentTranslationService.apply(c.env.DB, 'vod', localized.vods || [], c.req.query('lang'));
  return c.json({ code: 0, msg: 'ok', data: localized });
});

// MacCMS 分集剧情模块：只返回已发布且启用了剧情字段的视频。
const plotListHandler = async (c: any) => {
  const q = c.req.query();
  const data = await VodService.queryVods(c.env.DB, {
    page: parseInt(q.page || '1', 10),
    limit: parseInt(q.limit || '20', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined,
    year: q.year,
    area: q.area,
    letter: q.letter,
    wd: q.wd,
    by: q.by,
    order: q.order,
    plotOnly: true,
  });
  const list = data.list.map((vod) => ({
    ...sanitizeVodPublic(vod, true),
    plot_count: String(vod.vod_plot_name || '').split('$$$').filter((name) => name.trim()).length,
  }));
  return c.json({ code: 0, msg: 'ok', data: { ...data, list: await ContentTranslationService.apply(c.env.DB, 'vod', list, q.lang) } });
};

apiRouter.get('/plot/list', plotListHandler);
apiRouter.get('/plot/index', plotListHandler);
apiRouter.get('/plot/search', plotListHandler);

apiRouter.get('/plot/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的视频 ID' }, 400);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const data = await VodService.getPlotDetail(c.env.DB, id, page);
  if (!data) return c.json({ code: 404, msg: '分集剧情不存在' }, 404);
  return c.json({ code: 0, msg: 'ok', data });
});

// 11. 明星与角色接口
apiRouter.get('/actor/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '18', 10);
  const letter = q.letter;
  const wd = q.wd;
  const area = q.area;
  const data = await ActorService.queryActors(c.env.DB, { page, limit, letter, wd, area });
  return c.json({ code: 0, msg: 'ok', data: { ...data, list: await ContentTranslationService.apply(c.env.DB, 'actor', data.list, q.lang) } });
});

apiRouter.get('/actor/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await ActorService.getActorDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '明星信息不存在' }, 404);
  const language = c.req.query('lang');
  const localized = (await ContentTranslationService.apply(c.env.DB, 'actor', [data], language))[0];
  localized.vods = await ContentTranslationService.apply(c.env.DB, 'vod', localized.vods || [], language);
  localized.roles = await ContentTranslationService.apply(c.env.DB, 'role', localized.roles || [], language);
  return c.json({ code: 0, msg: 'ok', data: localized });
});

const roleListHandler = async (c: any) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '20', 10);
  const vodId = q.vod_id ? parseInt(q.vod_id, 10) : undefined;
  const actorId = q.actor_id ? parseInt(q.actor_id, 10) : undefined;
  const typeId = q.type_id ? parseInt(q.type_id, 10) : undefined;
  const wd = q.wd;
  const data = await ActorService.queryRoles(c.env.DB, { page, limit, vodId, actorId, typeId, letter: q.letter, area: q.area, wd });
  return c.json({ code: 0, msg: 'ok', data: { ...data, list: await ContentTranslationService.apply(c.env.DB, 'role', data.list, q.lang) } });
};
apiRouter.get('/role/list', roleListHandler);
apiRouter.get('/role/index', roleListHandler);
apiRouter.get('/role/show', roleListHandler);
apiRouter.get('/role/search', roleListHandler);

apiRouter.get('/role/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的角色 ID' }, 400);
  const data = await ActorService.getRoleDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '角色不存在或已下架' }, 404);
  const language = c.req.query('lang');
  const localized = (await ContentTranslationService.apply(c.env.DB, 'role', [data], language))[0];
  if (localized.actor) localized.actor = (await ContentTranslationService.apply(c.env.DB, 'actor', [localized.actor], language))[0];
  if (localized.vod) localized.vod = (await ContentTranslationService.apply(c.env.DB, 'vod', [localized.vod], language))[0];
  return c.json({ code: 0, msg: 'ok', data: localized });
});

// 12. 留言与报错接口
apiRouter.get('/gbook/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '20', 10);
  const data = await GbookService.queryGbooks(c.env.DB, { page, limit, status: 1 });
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/gbook/add', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    const id = await GbookService.addGbook(c.env.DB, {
      content: body.content,
      name: body.name,
      vodName: body.vod_name,
      playFrom: body.play_from,
      playPart: body.play_part,
      ip,
    });
    return c.json({ code: 0, msg: '反馈提交成功，感谢您的支持！', data: { id } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

// 13. 用户评论与互动
apiRouter.get('/comment/list', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  if (configs.comment_status === '0') return c.json({ code: 0, msg: '评论功能已关闭', data: [] });
  const mid = parseInt(c.req.query('mid') || '1', 10);
  const rid = parseInt(c.req.query('rid') || '0', 10);
  const data = await VodService.getComments(c.env.DB, mid, rid);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/comment/add', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  if (configs.comment_status === '0') return c.json({ code: 403, msg: '站点已关闭评论功能' }, 403);
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    const id = await VodService.addComment(c.env.DB, {
      mid: parseInt(body.mid || '1', 10),
      rid: parseInt(body.rid || '0', 10),
      pid: parseInt(body.pid || '0', 10),
      userId: await getUserFromHeader(c),
      name: body.name,
      ip,
      content: body.content,
      status: configs.comment_audit === '1' ? 0 : 1,
    });
    return c.json({ code: 0, msg: configs.comment_audit === '1' ? '评论已提交，审核通过后显示' : '评论发表成功', data: { comment_id: id } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

// 14. 广告位与友情链接
apiRouter.get('/ads', async (c) => {
  const data = await AdsService.getActiveAds(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.get('/links', async (c) => {
  const data = await VodService.getLinks(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data });
});

// MacCMS10 直播频道公开接口
apiRouter.get('/live/categories', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT live_category_id, live_category_name
    FROM live_category WHERE live_category_status = 1
    ORDER BY live_category_sort, live_category_id`).all();
  return c.json({ code: 0, msg: 'ok', data: rows.results || [] });
});

apiRouter.get('/live/list', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30', 10) || 30));
  const category = parseInt(c.req.query('category_id') || '0', 10) || 0;
  const where = category > 0 ? 'AND l.live_category_id = ?' : '';
  const params = category > 0 ? [category] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM live_channel l
    LEFT JOIN live_category c ON c.live_category_id = l.live_category_id
    WHERE l.live_status = 1 AND (c.live_category_status = 1 OR c.live_category_id IS NULL) ${where}`)
    .bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT l.live_id, l.live_category_id, c.live_category_name,
    l.live_name, l.live_url, l.live_logo, l.live_desc, l.live_sort
    FROM live_channel l LEFT JOIN live_category c ON c.live_category_id = l.live_category_id
    WHERE l.live_status = 1 AND (c.live_category_status = 1 OR c.live_category_id IS NULL) ${where}
    ORDER BY l.live_sort, l.live_id DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, msg: 'ok', data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

// 14.1 MacCMS 网址导航模型 (type_mid=11)
apiRouter.get('/website/list', async (c) => {
  const q = c.req.query();
  const data = await WebsiteService.query(c.env.DB, {
    page: parseInt(q.page || '1', 10),
    limit: parseInt(q.limit || '24', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined,
    wd: q.wd,
    status: 1,
  });
  const types = await VodService.getTypes(c.env.DB, 11);
  return c.json({ code: 0, msg: 'ok', data: { ...data, list: await ContentTranslationService.apply(c.env.DB, 'website', data.list, q.lang), types } });
});

apiRouter.get('/website/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的网址 ID' }, 400);
  const item = await WebsiteService.get(c.env.DB, id);
  if (!item || item.website_status !== 1) return c.json({ code: 404, msg: '网址不存在或已隐藏' }, 404);
  return c.json({ code: 0, msg: 'ok', data: (await ContentTranslationService.apply(c.env.DB, 'website', [item], c.req.query('lang')))[0] });
});

apiRouter.get('/website/go/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.text('网址不存在', 404);
  const destination = await WebsiteService.recordVisit(c.env.DB, id);
  if (!destination) return c.text('网址不存在或已隐藏', 404);
  return c.redirect(destination, 302);
});

// 15. 播放器配置接口
apiRouter.get('/players', async (c) => {
  const players = await VodService.getPlayers(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data: players });
});

// 16. 站点公开信息接口
apiRouter.get('/config', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  return c.json({
    code: 0,
    msg: 'ok',
    data: {
      site_name: configs.site_name || c.env.SITE_NAME || 'MacCMS 苹果影视',
      site_url: configs.site_url || c.env.SITE_URL || '',
      site_keywords: configs.site_keywords || '',
      site_description: configs.site_description || '',
    },
  });
});

// ==========================================
// 会员用户体系 API
// ==========================================

apiRouter.post('/user/register', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  if (configs.user_status === '0') return c.json({ code: 403, msg: '站点暂未开放会员注册' }, 403);
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    if (!await consumeRateLimit(c.env.DB, `register:${ip || 'unknown'}`, 8, 3600)) return c.json({ code: 429, msg: '注册请求过于频繁，请稍后重试' }, 429);
    if (configs.user_email_required === '1' && !String(body.email || '').trim()) return c.json({ code: 400, msg: '请填写邮箱后注册' }, 400);
    const blocked = await c.env.DB.prepare(`SELECT reason FROM user_access_rule WHERE
      ((rule_type='ip' AND rule_value=?) OR (rule_type='username' AND lower(rule_value)=lower(?)))
      AND (expires_at=0 OR expires_at>?) LIMIT 1`).bind(ip, String(body.username || '').trim(), Math.floor(Date.now() / 1000)).first<{ reason: string }>();
    if (blocked) return c.json({ code: 403, msg: blocked.reason || '当前来源不可注册' }, 403);
    const user = await UserService.register(c.env.DB, body, ip);
    if (configs.user_email_required === '1') {
      await MemberSecurityService.issueCode(c.env, user.user_id, String(body.email || ''), 'verify', ip);
      return c.json({ code: 0, msg: '注册成功，验证码已发送到邮箱；验证后即可登录', data: { requires_email_verification: true } });
    }
    const tokenSecret = await UserService.getTokenSecret(c.env.DB, c.env.JWT_SECRET || '');
    const token = await UserService.createUserSession(c.env.DB, user.user_id, tokenSecret, ip, c.req.header('User-Agent') || '');
    return c.json({ code: 0, msg: '注册成功', data: { user, token } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    const username = String(body.username || '').trim();
    if (!await consumeRateLimit(c.env.DB, `login:ip:${ip || 'unknown'}`, 20, 900)
      || !await consumeRateLimit(c.env.DB, `login:user:${username.toLowerCase()}`, 10, 900)) {
      return c.json({ code: 429, msg: '登录尝试过于频繁，请 15 分钟后重试' }, 429);
    }
    const candidate = await c.env.DB.prepare('SELECT user_id FROM user WHERE user_name=?').bind(username).first<{ user_id: number }>();
    const blocked = await c.env.DB.prepare(`SELECT reason FROM user_access_rule WHERE
      ((rule_type='ip' AND rule_value=?) OR (rule_type='username' AND lower(rule_value)=lower(?)) OR (rule_type='user_id' AND rule_value=?))
      AND (expires_at=0 OR expires_at>?) LIMIT 1`).bind(ip, String(body.username || '').trim(), String(candidate?.user_id || ''), Math.floor(Date.now() / 1000)).first<{ reason: string }>();
    if (blocked) return c.json({ code: 403, msg: blocked.reason || '当前来源不可登录' }, 403);
    const tokenSecret = await UserService.getTokenSecret(c.env.DB, c.env.JWT_SECRET || '');
    const data = await UserService.login(c.env.DB, body.username, body.password, ip, tokenSecret, c.req.header('User-Agent') || '');
    await Promise.all([
      clearRateLimit(c.env.DB, `login:ip:${ip || 'unknown'}`),
      clearRateLimit(c.env.DB, `login:user:${username.toLowerCase()}`),
    ]);
    const configs = await VodService.getConfigs(c.env.DB);
    if (configs.user_email_required === '1' && Number((data.user as any).user_email_verified || 0) !== 1) {
      await c.env.DB.prepare('UPDATE user_session SET revoked_at=? WHERE user_id=? AND revoked_at=0')
        .bind(Math.floor(Date.now() / 1000), data.user.user_id).run();
      return c.json({ code: 403, msg: '请先完成邮箱验证；可重新填写账号密码发送验证邮件' }, 403);
    }
    return c.json({ code: 0, msg: '登录成功', data });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/email/verification/send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ip = c.req.header('CF-Connecting-IP') || '';
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const userId = await getUserFromHeader(c);
  try {
    const settings = await VodService.getConfigs(c.env.DB);
    if (settings.user_email_required !== '1' && settings.user_email_verification !== '1') return c.json({ code: 403, msg: '邮箱验证入口暂未开放' }, 403);
    let targetUserId = userId;
    if (!targetUserId) {
      const account = await c.env.DB.prepare('SELECT user_id,user_pwd,user_email FROM user WHERE user_name=? AND user_status=1 LIMIT 1')
        .bind(username).first<{ user_id: number; user_pwd: string; user_email: string }>();
      if (!account || !await AuthUtils.verifyPassword(password, account.user_pwd)) return c.json({ code: 400, msg: '账号或密码错误' }, 400);
      targetUserId = account.user_id;
      if (email && email !== account.user_email.trim().toLowerCase()) return c.json({ code: 400, msg: '邮箱与账号绑定邮箱不一致' }, 400);
    }
    const target = await c.env.DB.prepare('SELECT user_email,user_email_verified FROM user WHERE user_id=? AND user_status=1')
      .bind(targetUserId).first<{ user_email: string; user_email_verified: number }>();
    if (!target?.user_email) return c.json({ code: 400, msg: '请先在会员资料中填写邮箱' }, 400);
    if (Number(target.user_email_verified) === 1) return c.json({ code: 0, msg: '邮箱已验证' });
    await MemberSecurityService.issueCode(c.env, targetUserId, target.user_email, 'verify', ip);
    return c.json({ code: 0, msg: '验证邮件已发送' });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '邮件发送失败' }, 400);
  }
});

apiRouter.post('/user/email/verification/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = await getUserFromHeader(c);
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  try {
    const settings = await VodService.getConfigs(c.env.DB);
    if (settings.user_email_required !== '1' && settings.user_email_verification !== '1') return c.json({ code: 403, msg: '邮箱验证入口暂未开放' }, 403);
    if (userId) {
      const current = await c.env.DB.prepare('SELECT user_email FROM user WHERE user_id=? AND user_status=1')
        .bind(userId).first<{ user_email: string }>();
      if (!current || current.user_email.trim().toLowerCase() !== email) return c.json({ code: 400, msg: '邮箱与当前账号不匹配' }, 400);
    }
    const verified = await MemberSecurityService.verifyEmail(c.env.DB, email, code);
    return verified ? c.json({ code: 0, msg: '邮箱验证成功' }) : c.json({ code: 400, msg: '验证码无效或已过期' }, 400);
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '验证失败' }, 400);
  }
});

apiRouter.post('/user/password/reset/send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const ip = c.req.header('CF-Connecting-IP') || '';
  if (!await consumeRateLimit(c.env.DB, `password-reset:${ip || 'unknown'}`, 8, 3600)) return c.json({ code: 429, msg: '请求过于频繁，请稍后重试' }, 429);
  try {
    if (MemberSecurityService.validEmail(email)) {
      const user = await c.env.DB.prepare('SELECT user_id FROM user WHERE lower(user_email)=? AND user_status=1 LIMIT 1')
        .bind(email).first<{ user_id: number }>();
      if (user) await MemberSecurityService.issueCode(c.env, user.user_id, email, 'reset', ip);
    }
    return c.json({ code: 0, msg: '如果该邮箱已绑定本站账号，验证码将发送到邮箱' });
  } catch (error) {
    // Keep reset responses non-enumerable while still reporting delivery configuration failures.
    console.error('Password reset email delivery failed:', error);
    return c.json({ code: 0, msg: '如果该邮箱已绑定本站账号，验证码将发送到邮箱' });
  }
});

apiRouter.post('/user/password/reset/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    await MemberSecurityService.resetPassword(c.env, String(body.email || ''), String(body.code || ''), String(body.new_password || ''));
    return c.json({ code: 0, msg: '密码已重置，请重新登录' });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '密码重置失败' }, 400);
  }
});

// 获取当前登录用户画像中间件辅助函数
const getUserSessionFromHeader = async (c: any): Promise<{ userId: number; sessionId: string }> => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { userId: 0, sessionId: '' };
  const secret = await UserService.getTokenSecret(c.env.DB, c.env.JWT_SECRET || '');
  const check = await AuthUtils.verifyToken(token, secret);
  const userId = check.valid && check.username ? parseInt(check.username.replace('user_', ''), 10) || 0 : 0;
  const sessionId = check.sessionId || '';
  if (!userId || !sessionId) return { userId: 0, sessionId: '' };
  const active = await c.env.DB.prepare(`SELECT session_id FROM user_session
    WHERE session_id=? AND user_id=? AND revoked_at=0 AND expires_at>? LIMIT 1`)
    .bind(sessionId, userId, Math.floor(Date.now() / 1000)).first();
  return active ? { userId, sessionId } : { userId: 0, sessionId: '' };
};

const getUserFromHeader = async (c: any): Promise<number> => {
  return (await getUserSessionFromHeader(c)).userId;
};

apiRouter.get('/user/invite', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  let code = await c.env.DB.prepare('SELECT invite_code FROM user_invite_code WHERE user_id=?').bind(userId).first<{ invite_code: string }>();
  if (!code) {
    for (let attempt = 0; attempt < 4 && !code; attempt += 1) {
      const candidate = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
      await c.env.DB.prepare('INSERT OR IGNORE INTO user_invite_code (user_id,invite_code,created_at) VALUES (?,?,?)')
        .bind(userId, candidate, Math.floor(Date.now() / 1000)).run();
      code = await c.env.DB.prepare('SELECT invite_code FROM user_invite_code WHERE user_id=?').bind(userId).first<{ invite_code: string }>();
    }
  }
  if (!code) return c.json({ code: 500, msg: '邀请码暂时不可用' }, 500);
  const [configRows, totals, invites] = await Promise.all([
    c.env.DB.prepare(`SELECT key,value FROM config WHERE key IN ('user_invite_status','user_invite_points','user_invited_points')`).all<{ key: string; value: string }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS invite_count,COALESCE(SUM(inviter_points),0) AS earned_points
      FROM user_invite_reward WHERE inviter_user_id=?`).bind(userId).first<{ invite_count: number; earned_points: number }>(),
    c.env.DB.prepare(`SELECT r.invitee_user_id,r.inviter_points,r.invitee_points,r.created_at,u.user_name
      FROM user_invite_reward r JOIN user u ON u.user_id=r.invitee_user_id
      WHERE r.inviter_user_id=? ORDER BY r.created_at DESC LIMIT 20`).bind(userId).all(),
  ]);
  const settings: Record<string, string> = {};
  for (const row of configRows.results || []) settings[row.key] = row.value;
  const inviteCode = code.invite_code;
  return c.json({ code: 0, data: {
    enabled: settings.user_invite_status === '1', invite_code: inviteCode,
    invite_url: `${new URL(c.req.url).origin}/user.html?invite=${encodeURIComponent(inviteCode)}`,
    inviter_points: Number(settings.user_invite_points || 50), invited_points: Number(settings.user_invited_points || 0),
    invite_count: totals?.invite_count || 0, earned_points: totals?.earned_points || 0, list: invites.results || [],
  } });
});

apiRouter.get('/user/sessions', async (c) => {
  const current = await getUserSessionFromHeader(c);
  if (!current.userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT session_id,created_at,last_seen_at,expires_at,user_agent
    FROM user_session WHERE user_id=? AND revoked_at=0 AND expires_at>? ORDER BY last_seen_at DESC LIMIT 30`)
    .bind(current.userId, Math.floor(Date.now() / 1000)).all();
  return c.json({ code: 0, data: (rows.results || []).map((row: any) => ({ ...row, is_current: row.session_id === current.sessionId })) });
});

apiRouter.post('/user/sessions/revoke-others', async (c) => {
  const current = await getUserSessionFromHeader(c);
  if (!current.userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const result = await c.env.DB.prepare(`UPDATE user_session SET revoked_at=?
    WHERE user_id=? AND session_id<>? AND revoked_at=0 AND expires_at>?`)
    .bind(Math.floor(Date.now() / 1000), current.userId, current.sessionId, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '其他设备已退出', data: { revoked: result.meta.changes || 0 } });
});

apiRouter.post('/user/sessions/:sessionId/revoke', async (c) => {
  const current = await getUserSessionFromHeader(c);
  if (!current.userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const sessionId = c.req.param('sessionId');
  const result = await c.env.DB.prepare(`UPDATE user_session SET revoked_at=?
    WHERE user_id=? AND session_id=? AND revoked_at=0`)
    .bind(Math.floor(Date.now() / 1000), current.userId, sessionId).run();
  if (!result.meta.changes) return c.json({ code: 404, msg: '设备会话不存在或已退出' }, 404);
  return c.json({ code: 0, msg: '该设备已退出' });
});

apiRouter.post('/user/logout', async (c) => {
  const current = await getUserSessionFromHeader(c);
  if (!current.userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  await c.env.DB.prepare('UPDATE user_session SET revoked_at=? WHERE user_id=? AND session_id=? AND revoked_at=0')
    .bind(Math.floor(Date.now() / 1000), current.userId, current.sessionId).run();
  return c.json({ code: 0, msg: '已退出当前设备' });
});

apiRouter.get('/manga/list', async (c) => {
  const q = c.req.query();
  const result = await MangaService.query(c.env.DB, { page: parseInt(q.page || '1', 10), limit: parseInt(q.limit || '20', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined, wd: q.wd, status: 1 });
  const types = await VodService.getTypes(c.env.DB, 12);
  const list = result.list.map((item) => {
    const { manga_chapter_url, manga_pwd, manga_pwd_url, manga_content, ...safe } = item as any;
    return { ...safe, chapter_count: (manga_chapter_url || '').split('$$$').join('#').split('#').filter(Boolean).length };
  });
  return c.json({ code: 0, data: { ...result, list: await ContentTranslationService.apply(c.env.DB, 'manga', list, q.lang), types } });
});

apiRouter.get('/manga/detail/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const item = await MangaService.get(c.env.DB, id);
  if (!item || item.manga_status !== 1 || Number((item as any).manga_recycle_time) > 0) return c.json({ code: 404, msg: '漫画不存在或已下架' }, 404);
  const { manga_chapter_url, manga_pwd, manga_pwd_url, ...safe } = item as any;
  const chapterCount = String(manga_chapter_url || '').split('$$$').join('#').split('#').filter(Boolean).length;
  const localized = (await ContentTranslationService.apply(c.env.DB, 'manga', [{ ...safe, chapter_count: chapterCount }], c.req.query('lang')))[0];
  return c.json({ code: 0, data: localized });
});

apiRouter.get('/manga/chapters/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const item: any = await MangaService.get(c.env.DB, id);
  if (!item || item.manga_status !== 1 || Number(item.manga_recycle_time) > 0) return c.json({ code: 404, msg: '漫画不存在或已下架' }, 404);
  const rawFrom = String(item.manga_chapter_from || '').split('$$$');
  const rawGroups = String(item.manga_chapter_url || '').split('$$$');
  const groups = rawGroups.map((raw: string, groupIndex: number) => ({
    source: rawFrom[groupIndex] || `线路 ${groupIndex + 1}`,
    chapters: raw.split('#').map((entry: string, chapterIndex: number) => {
      const parts = entry.split('$');
      const name = parts.length > 1 ? parts.shift() || `第 ${chapterIndex + 1} 话` : `第 ${chapterIndex + 1} 话`;
      const urls = parts.join('$').split(/[|,，]/).map((url: string) => url.trim()).filter(Boolean);
      return { index: chapterIndex + 1, name, urls };
    }).filter((chapter: any) => chapter.urls.length > 0),
  })).filter((group: any) => group.chapters.length > 0);
  if (!groups.length) return c.json({ code: 0, data: { groups: [] } });

  const userId = await getUserFromHeader(c);
  const vipRequired = Number(item.manga_is_vip) === 1 || Number(item.group_id) > 1;
  const wholeCost = Math.max(0, Number(item.manga_points) || 0);
  const chapterCost = Math.max(0, Number(item.manga_points_detail) || 0);
  if ((vipRequired || wholeCost || chapterCost) && !userId) return c.json({ code: 403, msg: '请登录后阅读此漫画' }, 403);
  const requested = Math.max(0, Number(c.req.query('chapter')) || 0);
  let wholePurchased = false;
  let user: any = null;
  let vip = false;
  if (userId) {
    user = await UserService.getUserProfile(c.env.DB, userId);
    if (!user) return c.json({ code: 401, msg: '登录状态已失效' }, 401);
    const now = Math.floor(Date.now() / 1000);
    vip = Number(user.group_id) >= 2 && (!Number(user.user_end_time) || Number(user.user_end_time) > now);
    if (Number(item.group_id) > 1 && (!vip || Number(user.group_id) < Number(item.group_id))) return c.json({ code: 403, msg: '当前会员组等级不能阅读此漫画' }, 403);
    const bought = await c.env.DB.prepare(`SELECT ulog_id FROM ulog WHERE user_id=? AND ulog_mid=12 AND ulog_rid=? AND ulog_type=3 AND ulog_nid=0 LIMIT 1`)
      .bind(userId, id).first();
    wholePurchased = !!bought || vip;
    if (Number(item.manga_is_vip) === 1 && !vip) return c.json({ code: 403, msg: '此漫画仅限 VIP 会员阅读' }, 403);
  }
  const chapterIndex = requested || 0;
  const chapterExists = chapterIndex > 0 && groups.some((group: any) => group.chapters.some((chapter: any) => chapter.index === chapterIndex));
  if (requested && !chapterExists) return c.json({ code: 404, msg: '漫画章节不存在' }, 404);
  if (!requested) return c.json({ code: 0, data: { locked: !!(vipRequired || wholeCost || chapterCost) && !wholePurchased,
    whole_cost: wholePurchased ? 0 : wholeCost, chapter_cost: wholePurchased ? 0 : chapterCost,
    groups: groups.map((group: any) => ({ source: group.source, chapters: group.chapters.map((chapter: any) => ({ index: chapter.index, name: chapter.name })) })) } });
  if (wholeCost > 0 && !wholePurchased) {
    if (Number(user?.user_points || 0) < wholeCost) return c.json({ code: 403, msg: `购买整本需要 ${wholeCost} 积分` }, 403);
    await UserService.updatePoints(c.env.DB, userId, -wholeCost);
    await UserService.addUlog(c.env.DB, { userId, mid: 12, type: 3, rid: id, nid: 0, points: wholeCost });
    wholePurchased = true;
  }
  if (chapterCost > 0 && !wholePurchased) {
    const bought = await c.env.DB.prepare(`SELECT ulog_id FROM ulog WHERE user_id=? AND ulog_mid=12 AND ulog_rid=? AND ulog_type=3 AND ulog_nid=? LIMIT 1`)
      .bind(userId, id, requested).first();
    if (!bought) {
      const current = await UserService.getUserProfile(c.env.DB, userId);
      if (Number(current?.user_points || 0) < chapterCost) return c.json({ code: 403, msg: `阅读本章需要 ${chapterCost} 积分` }, 403);
      await UserService.updatePoints(c.env.DB, userId, -chapterCost);
      await UserService.addUlog(c.env.DB, { userId, mid: 12, type: 3, rid: id, nid: requested, points: chapterCost });
    }
  }
  await c.env.DB.prepare('UPDATE manga SET manga_hits=manga_hits+1 WHERE manga_id=?').bind(id).run();
  return c.json({ code: 0, data: { groups: groups.map((group: any) => ({ source: group.source,
    chapters: group.chapters.filter((chapter: any) => chapter.index === requested) })) } });
});

apiRouter.get('/user/profile', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const user = await UserService.getUserProfile(c.env.DB, userId);
  if (!user || user.user_status !== 1) return c.json({ code: 401, msg: '账号不存在或已停用' }, 401);
  const { user_login_ip, user_last_login_ip, user_pwd, ...safeUser } = user as any;
  return c.json({ code: 0, msg: 'ok', data: safeUser });
});

apiRouter.post('/user/profile', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    const user = await UserService.updateProfile(c.env.DB, userId, body);
    const { user_login_ip, user_last_login_ip, user_pwd, ...safeUser } = user as any;
    return c.json({ code: 0, msg: '资料已保存', data: safeUser });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/avatar', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const bucket = c.env.MEDIA_BUCKET;
  const storage = await loadMediaStorageConfig(c.env.DB);
  if (storage.provider === 'r2' && !bucket) return c.json({ code: 503, msg: '头像存储未配置，请绑定 R2 媒体桶或切换到其他附件后端' }, 503);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ code: 400, msg: '请上传图片文件' }, 400); }
  const file = form.get('avatar');
  if (!(file instanceof File)) return c.json({ code: 400, msg: '请上传图片文件' }, 400);
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) return c.json({ code: 400, msg: '图片大小须在 1 字节到 2 MB 之间' }, 400);

  const imageTypes: Record<string, { ext: string; signature(bytes: Uint8Array): boolean }> = {
    'image/jpeg': { ext: 'jpg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    'image/png': { ext: 'png', signature: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    'image/gif': { ext: 'gif', signature: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
    'image/webp': { ext: 'webp', signature: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  };
  const format = imageTypes[file.type];
  if (!format) return c.json({ code: 400, msg: '仅支持 JPG、PNG、GIF、WebP 图片' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!format.signature(bytes)) return c.json({ code: 400, msg: '图片内容与文件类型不匹配' }, 400);
  const user = await c.env.DB.prepare('SELECT user_name,user_pic FROM user WHERE user_id=? AND user_status=1')
    .bind(userId).first<{ user_name: string; user_pic: string }>();
  if (!user) return c.json({ code: 401, msg: '账号不存在或已停用' }, 401);
  const origin = new URL(c.req.url).origin;
  let key = '';
  let providerRef = '';
  let publicUrl = '';
  let mediaId = 0;
  try {
    if (storage.provider === 'telegraph') {
      publicUrl = await uploadToTelegraph(storage, new Blob([bytes], { type: file.type }), file.name || `avatar.${format.ext}`, file.type);
      key = `telegraph:${crypto.randomUUID()}`;
    } else if (storage.provider === 'telegram') {
      const uploaded = await uploadToTelegram(c.env.DB, storage, new Blob([bytes], { type: file.type }), file.name || `avatar.${format.ext}`, file.type, origin);
      key = uploaded.objectKey;
      providerRef = uploaded.providerRef;
      publicUrl = uploaded.publicUrl;
    } else {
      key = `user-avatars/${userId}/${Date.now()}-${crypto.randomUUID()}.${format.ext}`;
      publicUrl = `${origin}/media/${key}`;
      await bucket!.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
    }
    const inserted = await c.env.DB.prepare(`INSERT INTO media_asset (object_key,storage_provider,provider_ref,file_name,content_type,file_size,public_url,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(key, storage.provider, providerRef, file.name.slice(0, 240) || `avatar.${format.ext}`, file.type, file.size,
      publicUrl, user.user_name, Math.floor(Date.now() / 1000)).run();
    mediaId = Number(inserted.meta.last_row_id || 0);
    const updated = await c.env.DB.prepare('UPDATE user SET user_pic=? WHERE user_id=? AND user_status=1')
      .bind(publicUrl, userId).run();
    if (Number(updated.meta.changes || 0) !== 1) throw new Error('账号状态已变化，头像未保存');
  } catch (err) {
    if (mediaId) await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id=?').bind(mediaId).run().catch(() => {});
    if (key) await deleteStoredMedia(storage.provider, bucket, storage, key, publicUrl).catch(() => {});
    console.error('Member avatar upload failed:', err);
    return c.json({ code: 500, msg: '头像上传失败，请稍后重试' }, 500);
  }

  const oldAvatar = String(user.user_pic || '');
  if (oldAvatar && oldAvatar !== publicUrl) {
    const absoluteOld = new URL(oldAvatar, origin).toString();
    const oldAsset = await c.env.DB.prepare('SELECT media_id,object_key,storage_provider,public_url FROM media_asset WHERE public_url IN (?,?) AND media_id<>? LIMIT 1')
      .bind(oldAvatar, absoluteOld, mediaId).first<{ media_id: number; object_key: string; storage_provider: string; public_url: string }>();
    if (oldAsset) {
      const references = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM user WHERE user_id<>? AND (instr(user_pic,?)>0 OR instr(user_pic,?)>0)')
        .bind(userId, oldAsset.public_url, oldAvatar).first<{ c: number }>();
      if (!(references?.c || 0)) {
        try {
          await deleteStoredMedia(oldAsset.storage_provider, bucket, storage, oldAsset.object_key, oldAsset.public_url);
          await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id=?').bind(oldAsset.media_id).run();
        } catch { /* Keep the old media record available for manual cleanup if its provider rejects deletion. */ }
      }
    } else if (storage.provider === 'r2' && oldAvatar.startsWith(`/media/user-avatars/${userId}/`)) {
      await bucket?.delete(oldAvatar.slice('/media/'.length)).catch(() => {});
    }
  }
  return c.json({ code: 0, msg: '头像已更新', data: { user_pic: publicUrl } });
});

apiRouter.post('/user/password/change', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    await UserService.changePassword(c.env.DB, userId, String(body.current_password || ''), String(body.new_password || ''));
    return c.json({ code: 0, msg: '密码已修改' });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/redeem_card', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    const res = await CardService.redeemCard(c.env.DB, userId, body.card_no, body.card_pwd);
    return c.json({ code: 0, msg: `充值成功，获得 ${res.points} 积分！`, data: res });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/buy_vip', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    const res = await UserService.buyVip(c.env.DB, userId, body.type || 'month');
    return c.json({ code: 0, msg: 'VIP 会员开通成功！', data: res });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.get('/user/history', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const data = await UserService.getUlogs(c.env.DB, userId, 1, 30);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/user/history', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 0 }); // 未登录不强制报错
  const body = await c.req.json().catch(() => ({}));
  await UserService.addUlog(c.env.DB, {
    userId,
    mid: parseInt(body.mid || '1', 10),
    type: 1, // 历史
    rid: parseInt(body.rid, 10),
    sid: parseInt(body.sid || '0', 10),
    nid: parseInt(body.nid || '0', 10),
  });
  return c.json({ code: 0, msg: 'ok' });
});

apiRouter.get('/user/progress', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 30));
  const rows = await c.env.DB.prepare(`SELECT p.vod_id,p.play_sid,p.play_nid,p.episode_name,p.position_seconds,
    p.duration_seconds,p.updated_at,v.vod_name,v.vod_pic,v.vod_remarks
    FROM user_play_progress p JOIN vod v ON v.vod_id=p.vod_id
    WHERE p.user_id=? AND v.vod_status=1 ORDER BY p.updated_at DESC LIMIT ?`).bind(userId, limit).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/user/progress', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const vodId = Number(body.vod_id);
  const sid = Number(body.sid || 0);
  const nid = Number(body.nid || 0);
  const position = Math.floor(Number(body.position_seconds ?? body.time));
  const duration = Math.floor(Number(body.duration_seconds ?? body.duration));
  if (![vodId, sid, nid, position, duration].every(Number.isInteger) || vodId <= 0 || sid < 0 || nid < 0 || position < 0 || duration < 0 || position > 604800 || duration > 604800) {
    return c.json({ code: 400, msg: '播放进度参数无效' }, 400);
  }
  const episodeName = String(body.episode_name || body.ep_name || '').trim().slice(0, 120);
  const now = Math.floor(Date.now() / 1000);
  const vod = await c.env.DB.prepare('SELECT vod_id FROM vod WHERE vod_id=? AND vod_status=1').bind(vodId).first();
  if (!vod) return c.json({ code: 404, msg: '视频不存在或已下架' }, 404);
  if (duration > 0 && position >= duration - 10) {
    await c.env.DB.prepare('DELETE FROM user_play_progress WHERE user_id=? AND vod_id=? AND play_sid=? AND play_nid=?')
      .bind(userId, vodId, sid, nid).run();
    return c.json({ code: 0, msg: '已记录播放完成', data: { completed: true } });
  }
  await c.env.DB.prepare(`INSERT INTO user_play_progress
    (user_id,vod_id,play_sid,play_nid,episode_name,position_seconds,duration_seconds,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,vod_id,play_sid,play_nid) DO UPDATE SET
      episode_name=excluded.episode_name,position_seconds=excluded.position_seconds,
      duration_seconds=excluded.duration_seconds,updated_at=excluded.updated_at`)
    .bind(userId, vodId, sid, nid, episodeName, position, duration, now, now).run();
  return c.json({ code: 0, msg: '播放进度已保存', data: { completed: false, position_seconds: position } });
});

apiRouter.get('/user/favs', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const data = await UserService.getUlogs(c.env.DB, userId, 2, 50);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/user/favs/toggle', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const res = await UserService.toggleFav(c.env.DB, userId, parseInt(body.mid || '1', 10), parseInt(body.rid, 10));
  return c.json({ code: 0, msg: res.isFav ? '已加入收藏' : '已取消收藏', data: res });
});

// MacCMS10 会员扩展：关注、签到、私信、优惠券、积分商城和互动数据。
apiRouter.get('/user/follows', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare('SELECT * FROM user_follow WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').bind(userId).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/user/follows/toggle', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const model = body.model ? String(body.model) : '';
  const midByModel: Record<string, number> = { vod: 1, art: 2, topic: 3, actor: 8, manga: 12, website: 11 };
  const mid = model === 'user' ? 0 : (midByModel[model] ?? Number(body.mid));
  const rid = Number(body.id || body.rid);
  if (!Number.isInteger(mid) || mid < 0 || !Number.isInteger(rid) || rid <= 0 || mid > 20) return c.json({ code: 400, msg: '关注目标无效' }, 400);
  if (mid === 0) {
    if (rid === userId) return c.json({ code: 400, msg: '不能关注自己' }, 400);
    const target = await c.env.DB.prepare('SELECT user_id FROM user WHERE user_id=? AND user_status=1').bind(rid).first();
    if (!target) return c.json({ code: 404, msg: '会员不存在或已停用' }, 404);
  }
  const existing = await c.env.DB.prepare('SELECT follow_id FROM user_follow WHERE user_id=? AND follow_mid=? AND follow_rid=?').bind(userId, mid, rid).first<{ follow_id: number }>();
  if (existing) {
    await c.env.DB.prepare('DELETE FROM user_follow WHERE follow_id=?').bind(existing.follow_id).run();
    return c.json({ code: 0, msg: '已取消关注', data: { followed: false } });
  }
  await c.env.DB.prepare('INSERT OR IGNORE INTO user_follow (user_id,follow_mid,follow_rid,created_at) VALUES (?,?,?,?)')
    .bind(userId, mid, rid, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '已关注', data: { followed: true } });
});

apiRouter.post('/user/sign', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const now = Math.floor(Date.now() / 1000);
  const signDay = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const settings = await VodService.getConfigs(c.env.DB);
  const points = Math.max(0, Math.min(1000, parseInt(settings.sign_reward_points || '5', 10) || 0));
  const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO sign_log (user_id,sign_day,points,created_at) VALUES (?,?,?,?)')
    .bind(userId, signDay, points, now).run();
  if (!inserted.meta.changes) return c.json({ code: 409, msg: '今天已经签到', data: { points: 0, sign_day: signDay } }, 409);
  const history = await c.env.DB.prepare('SELECT sign_day FROM sign_log WHERE user_id=? ORDER BY sign_day DESC LIMIT 400')
    .bind(userId).all<{ sign_day: string }>();
  let streak = 0;
  let expected = Date.parse(`${signDay}T00:00:00Z`);
  for (const row of history.results || []) {
    if (Date.parse(`${row.sign_day}T00:00:00Z`) !== expected) break;
    streak++;
    expected -= 86400 * 1000;
  }
  const milestone = await c.env.DB.prepare(`INSERT OR IGNORE INTO user_sign_milestone
    (user_id,milestone_id,sign_days,reward_name,reward_points,claimed_at)
    SELECT ?,milestone_id,sign_days,reward_name,reward_points,? FROM sign_milestone
    WHERE sign_days=? AND status=1`).bind(userId, now, streak).run();
  let milestonePoints = 0;
  let milestoneName = '';
  if (milestone.meta.changes) {
    const reward = await c.env.DB.prepare(`SELECT reward_name,reward_points FROM sign_milestone
      WHERE sign_days=? AND status=1`).bind(streak).first<{ reward_name: string; reward_points: number }>();
    milestonePoints = Number(reward?.reward_points || 0);
    milestoneName = reward?.reward_name || '';
  }
  const user = await c.env.DB.prepare('SELECT user_points FROM user WHERE user_id=?').bind(userId).first<{ user_points: number }>();
  return c.json({ code: 0, msg: milestonePoints ? `签到成功，连续 ${streak} 天并获得里程碑奖励 ${milestonePoints} 积分` : `签到成功，获得 ${points} 积分`,
    data: { points, milestone_points: milestonePoints, milestone_name: milestoneName, streak, sign_day: signDay, balance: user?.user_points || 0 } });
});

apiRouter.get('/user/messages', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT p.*, u.user_name AS sender_name FROM user_pm p
    LEFT JOIN user u ON u.user_id=p.sender_id WHERE p.receiver_id=? AND p.status=1
    ORDER BY p.pm_id DESC LIMIT 100`).bind(userId).all();
  await c.env.DB.prepare('UPDATE user_pm SET is_read=1 WHERE receiver_id=? AND is_read=0').bind(userId).run();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/user/messages', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const receiverId = Number(body.receiver_id);
  const content = String(body.content || '').trim();
  if (!Number.isInteger(receiverId) || receiverId <= 0 || receiverId === userId || !content || content.length > 2000) return c.json({ code: 400, msg: '收件人或私信内容无效' }, 400);
  const recipient = await c.env.DB.prepare('SELECT user_id FROM user WHERE user_id=? AND user_status=1').bind(receiverId).first();
  if (!recipient) return c.json({ code: 404, msg: '收件会员不存在或已停用' }, 404);
  const result = await c.env.DB.prepare('INSERT INTO user_pm (sender_id,receiver_id,content,created_at) VALUES (?,?,?,?)')
    .bind(userId, receiverId, content, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '私信已发送', data: { pm_id: result.meta.last_row_id } });
});

apiRouter.get('/user/coupons', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT uc.user_coupon_id,uc.redeemed_at,uc.used_at,uc.order_id,c.coupon_code,c.coupon_name,
    c.discount_type,c.discount_value,c.min_spend,c.starts_at,c.ends_at FROM user_coupon uc JOIN coupon c ON c.coupon_id=uc.coupon_id
    WHERE uc.user_id=? ORDER BY uc.redeemed_at DESC`).bind(userId).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/user/coupons/redeem', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const coupon = await c.env.DB.prepare(`SELECT * FROM coupon WHERE coupon_code=? AND status=1
    AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>=?)`).bind(code, now, now).first<any>();
  if (!coupon) return c.json({ code: 404, msg: '优惠码无效或已过期' }, 404);
  const existing = await c.env.DB.prepare('SELECT user_coupon_id FROM user_coupon WHERE coupon_id=? AND user_id=?').bind(coupon.coupon_id, userId).first();
  if (existing) return c.json({ code: 409, msg: '该优惠码已领取' }, 409);
  const claim = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO user_coupon (coupon_id,user_id,redeemed_at)
      SELECT coupon_id,?,? FROM coupon WHERE coupon_id=? AND status=1 AND used_count<max_uses
      AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>=?)`).bind(userId, now, coupon.coupon_id, now, now),
    c.env.DB.prepare('UPDATE coupon SET used_count=used_count+1 WHERE coupon_id=? AND changes()=1').bind(coupon.coupon_id),
  ]);
  if (!claim[0]?.meta.changes) return c.json({ code: 409, msg: '优惠码已领取或名额已用完' }, 409);
  return c.json({ code: 0, msg: '优惠券已领取', data: { coupon_id: coupon.coupon_id, coupon_name: coupon.coupon_name } });
});

apiRouter.get('/user/payment/plans', async (c) => {
  try {
    const configs = await VodService.getConfigs(c.env.DB);
    const enabled = Boolean(configs.payment_checkout_url && configs.payment_merchant_id && configs.payment_secret);
    const plans = enabled ? await PaymentService.plans(c.env.DB) : [];
    return c.json({ code: 0, data: { enabled, plans } });
  } catch (error) {
    return c.json({ code: 500, msg: error instanceof Error ? error.message : '支付套餐读取失败' }, 500);
  }
});

apiRouter.post('/user/payment/create', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  try {
    const payment = await PaymentService.create(c.env, userId, String(body.plan_code || ''), new URL(c.req.url).origin);
    return c.json({ code: 0, msg: '订单已创建，请完成支付', data: payment });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '创建支付订单失败' }, 400);
  }
});

apiRouter.get('/user/payments', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT order_code,product_type,product_value,amount_cents,status,created_at,expires_at,paid_at
    FROM payment_intent WHERE user_id=? ORDER BY created_at DESC LIMIT 30`).bind(userId).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.get('/user/feed', async (c) => {
  const userId = await getUserFromHeader(c);
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));
  const rows = await c.env.DB.prepare(`SELECT p.post_id,p.user_id,u.user_nick,u.user_name,p.content,p.visibility,p.created_at,
      (SELECT COUNT(*) FROM user_post_like l WHERE l.post_id=p.post_id) AS like_count,
      EXISTS(SELECT 1 FROM user_post_like l WHERE l.post_id=p.post_id AND l.user_id=?) AS liked
    FROM user_post p JOIN user u ON u.user_id=p.user_id
    WHERE p.status=1 AND (p.visibility='public' OR p.user_id=? OR (p.visibility='followers' AND EXISTS(
      SELECT 1 FROM user_follow f WHERE f.user_id=? AND f.follow_mid=0 AND f.follow_rid=p.user_id)))
    ORDER BY p.created_at DESC,p.post_id DESC LIMIT ?`).bind(userId, userId, userId, limit).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.get('/user/posts/mine', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT post_id,content,visibility,status,created_at FROM user_post
    WHERE user_id=? ORDER BY post_id DESC LIMIT 50`).bind(userId).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/user/posts', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  if (!await consumeRateLimit(c.env.DB, `post:user:${userId}`, 10, 3600)) return c.json({ code: 429, msg: '动态发布过于频繁，请稍后重试' }, 429);
  const body = await c.req.json().catch(() => ({}));
  const content = String(body.content || '').trim();
  const visibility = ['public', 'followers', 'private'].includes(String(body.visibility)) ? String(body.visibility) : 'public';
  if (!content || content.length > 1000) return c.json({ code: 400, msg: '动态内容须为 1 至 1000 个字符' }, 400);
  const audit = await c.env.DB.prepare("SELECT value FROM config WHERE key='user_post_audit'").first<{ value: string }>();
  const status = audit?.value === '1' ? 0 : 1;
  const result = await c.env.DB.prepare('INSERT INTO user_post(user_id,content,visibility,status,created_at) VALUES(?,?,?,?,?)')
    .bind(userId, content, visibility, status, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: status ? '动态已发布' : '动态已提交审核', data: { post_id: Number(result.meta.last_row_id), status } });
});

apiRouter.post('/user/posts/:id/like', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const postId = Number(c.req.param('id'));
  const post = await c.env.DB.prepare(`SELECT p.post_id,p.user_id,p.visibility FROM user_post p WHERE p.post_id=? AND p.status=1 AND
    (p.visibility='public' OR p.user_id=? OR (p.visibility='followers' AND EXISTS(
      SELECT 1 FROM user_follow f WHERE f.user_id=? AND f.follow_mid=0 AND f.follow_rid=p.user_id)))`)
    .bind(postId, userId, userId).first<{ post_id: number; user_id: number; visibility: string }>();
  if (!post) return c.json({ code: 404, msg: '动态不存在或无权查看' }, 404);
  const existing = await c.env.DB.prepare('SELECT post_id FROM user_post_like WHERE post_id=? AND user_id=?').bind(postId, userId).first();
  if (existing) {
    await c.env.DB.prepare('DELETE FROM user_post_like WHERE post_id=? AND user_id=?').bind(postId, userId).run();
    return c.json({ code: 0, msg: '已取消点赞', data: { liked: false } });
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO user_post_like(post_id,user_id,created_at) VALUES(?,?,?)').bind(postId, userId, now),
    c.env.DB.prepare(`INSERT INTO user_notification(user_id,title,body,kind,target_url,created_at)
      SELECT user_id,'动态收到点赞','你的动态收到了一个赞','social','/user.html',? FROM user_post
      WHERE post_id=? AND user_id<>? AND changes()=1`).bind(now, postId, userId),
  ]);
  return c.json({ code: 0, msg: '已点赞', data: { liked: true } });
});

apiRouter.get('/user/wallet', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const [wallet, withdrawals] = await Promise.all([
    c.env.DB.prepare('SELECT balance_cents FROM user_wallet WHERE user_id=?').bind(userId).first<{ balance_cents: number }>(),
    c.env.DB.prepare(`SELECT withdrawal_id,amount_cents,payout_method,payout_account,status,note,created_at,updated_at
      FROM cash_withdrawal WHERE user_id=? ORDER BY withdrawal_id DESC LIMIT 30`).bind(userId).all(),
  ]);
  return c.json({ code: 0, data: { balance_cents: Number(wallet?.balance_cents || 0), withdrawals: withdrawals.results || [] } });
});

apiRouter.post('/user/wallet/withdraw', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  if (!await consumeRateLimit(c.env.DB, `withdrawal:user:${userId}`, 5, 86400)) return c.json({ code: 429, msg: '提现申请次数过多，请明天再试' }, 429);
  const body = await c.req.json().catch(() => ({}));
  const amountCents = Math.trunc(Number(body.amount_cents) || 0);
  const method = String(body.payout_method || '').trim().toLowerCase();
  const account = String(body.payout_account || '').trim();
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 100000000) return c.json({ code: 400, msg: '提现金额须为 1.00 至 1,000,000.00 元' }, 400);
  if (!['alipay', 'wechat', 'bank', 'other'].includes(method)) return c.json({ code: 400, msg: '请选择有效的收款方式' }, 400);
  if (account.length < 3 || account.length > 250) return c.json({ code: 400, msg: '收款账号长度无效' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO user_wallet(user_id,balance_cents,updated_at) VALUES(?,0,?)').bind(userId, now),
    c.env.DB.prepare('UPDATE user_wallet SET balance_cents=balance_cents-?,updated_at=? WHERE user_id=? AND balance_cents>=?')
      .bind(amountCents, now, userId, amountCents),
    c.env.DB.prepare(`INSERT INTO cash_withdrawal(user_id,amount_cents,payout_method,payout_account,status,created_at,updated_at)
      SELECT ?,?,?,?,'pending',?,? WHERE changes()=1`).bind(userId, amountCents, method, account, now, now),
    c.env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
      SELECT ?, 'cash_withdrawal', ?, 0, 1, '提现申请冻结', 'system', ? WHERE changes()=1`)
      .bind(userId, -amountCents / 100, now),
  ]);
  if (!result[1]?.meta.changes || !result[2]?.meta.changes) return c.json({ code: 409, msg: '钱包余额不足，请刷新余额后重试' }, 409);
  return c.json({ code: 0, msg: '提现申请已提交，金额已冻结，等待管理员处理' });
});

apiRouter.get('/push/public-key', async (c) => {
  const publicKey = await WebPushService.publicKey(c.env.DB);
  return c.json({ code: 0, data: { public_key: publicKey } }, 200, { 'Cache-Control': 'public, max-age=300' });
});

apiRouter.post('/user/push/subscribe', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const endpoint = String(body.endpoint || '').trim();
  const p256dh = String(body.keys?.p256dh || '').trim();
  const auth = String(body.keys?.auth || '').trim();
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || endpoint.length > 2048) return c.json({ code: 400, msg: 'Push endpoint 无效' }, 400);
  } catch { return c.json({ code: 400, msg: 'Push endpoint 无效' }, 400); }
  if (!p256dh || !auth || p256dh.length > 200 || auth.length > 100) return c.json({ code: 400, msg: 'Push 订阅密钥无效' }, 400);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`INSERT INTO web_push_subscription(user_id,endpoint,p256dh,auth_secret,created_at,last_used_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,
    auth_secret=excluded.auth_secret,last_error=''`).bind(userId, endpoint, p256dh, auth, now, now).run();
  return c.json({ code: 0, msg: '已开启此设备的通知推送' });
});

apiRouter.post('/user/push/unsubscribe', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare('DELETE FROM web_push_subscription WHERE user_id=? AND endpoint=?')
    .bind(userId, String(body.endpoint || '').slice(0, 2048)).run();
  return c.json({ code: 0, msg: '已关闭此设备的通知推送' });
});

apiRouter.get('/user/notifications', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 30));
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT notification_id,title,body,kind,target_url,created_at,read_at FROM user_notification
      WHERE user_id=? ORDER BY created_at DESC,notification_id DESC LIMIT ?`).bind(userId, limit).all(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM user_notification WHERE user_id=? AND read_at=0').bind(userId).first<{ c: number }>(),
  ]);
  return c.json({ code: 0, data: { unread: Number(count?.c || 0), list: rows.results || [] } });
});

apiRouter.post('/user/notifications/read', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))).slice(0, 100) : [];
  if (!ids.length) await c.env.DB.prepare('UPDATE user_notification SET read_at=? WHERE user_id=? AND read_at=0').bind(now, userId).run();
  else await c.env.DB.prepare(`UPDATE user_notification SET read_at=? WHERE user_id=? AND read_at=0 AND notification_id IN (${ids.map(() => '?').join(',')})`)
    .bind(now, userId, ...ids).run();
  return c.json({ code: 0, msg: '通知已标记为已读' });
});

apiRouter.post('/payment/notify', async (c) => {
  let body: any;
  try { body = await c.req.json(); }
  catch {
    try { body = Object.fromEntries(await c.req.formData()); }
    catch { return c.json({ code: 400, msg: '支付通知格式无效' }, 400); }
  }
  try {
    const result = await PaymentService.processCallback(c.env, {
      order_code: String(body.order_code || ''), amount_cents: Number(body.amount_cents),
      merchant_id: String(body.merchant_id || ''), provider_event_id: String(body.provider_event_id || ''),
      status: String(body.status || ''), timestamp: Number(body.timestamp), sign: String(body.sign || ''),
      provider_ref: body.provider_ref ? String(body.provider_ref) : '',
    });
    return c.json({ code: 0, msg: result.already_paid ? '订单已完成' : '支付成功' });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '支付通知处理失败' }, 400);
  }
});

apiRouter.get('/mall/goods', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM mall_goods WHERE status=1 ORDER BY sort,goods_id DESC LIMIT 100').all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.get('/mall/seckill', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const rows = await c.env.DB.prepare(`SELECT s.*,g.goods_name,g.goods_desc,g.goods_pic,g.points AS goods_points,g.price AS goods_price
    FROM seckill_campaign s JOIN mall_goods g ON g.goods_id=s.goods_id
    WHERE s.status=1 AND g.status=1 AND s.inventory>0
      AND (s.starts_at=0 OR s.starts_at<=?) AND (s.ends_at=0 OR s.ends_at>=?)
    ORDER BY s.ends_at,s.campaign_id DESC LIMIT 100`).bind(now, now).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/mall/orders', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const goodsId = Number(body.goods_id);
  const quantity = Math.min(10, Math.max(1, parseInt(body.quantity, 10) || 1));
  const goods = await c.env.DB.prepare('SELECT * FROM mall_goods WHERE goods_id=? AND status=1').bind(goodsId).first<any>();
  if (!goods || Number(goods.inventory) < quantity) return c.json({ code: 409, msg: '商品不存在、已下架或库存不足' }, 409);
  const seckillId = Math.max(0, parseInt(body.seckill_id, 10) || 0);
  const now = Math.floor(Date.now() / 1000);
  const campaign = seckillId ? await c.env.DB.prepare(`SELECT * FROM seckill_campaign WHERE campaign_id=? AND goods_id=? AND status=1
    AND inventory>=? AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>=?)`)
    .bind(seckillId, goodsId, quantity, now, now).first<any>() : null;
  if (seckillId && !campaign) return c.json({ code: 409, msg: '秒杀活动未开始、已结束或库存不足' }, 409);
  const totalPoints = Math.max(0, Math.trunc(Number(goods.points) || 0)) * quantity;
  const originalPrice = Math.round(Math.max(0, Number(campaign?.sale_price ?? goods.price) || 0) * quantity * 100) / 100;
  const couponId = Math.max(0, parseInt(body.user_coupon_id, 10) || 0);
  let discount = 0;
  if (couponId) {
    if (seckillId) return c.json({ code: 400, msg: '秒杀订单不能叠加优惠券' }, 400);
    const coupon = await c.env.DB.prepare(`SELECT uc.user_coupon_id,uc.used_at,uc.order_id,c.*
      FROM user_coupon uc JOIN coupon c ON c.coupon_id=uc.coupon_id
      WHERE uc.user_coupon_id=? AND uc.user_id=?`).bind(couponId, userId).first<any>();
    if (!coupon || coupon.used_at || coupon.order_id || Number(coupon.status) !== 1
      || (coupon.starts_at && Number(coupon.starts_at) > now) || (coupon.ends_at && Number(coupon.ends_at) < now)) {
      return c.json({ code: 409, msg: '优惠券不可用、已过期或已被其他订单占用' }, 409);
    }
    if (originalPrice < Number(coupon.min_spend || 0)) return c.json({ code: 400, msg: `此优惠券最低消费 ¥${Number(coupon.min_spend).toFixed(2)}` }, 400);
    const value = Math.max(0, Number(coupon.discount_value) || 0);
    discount = coupon.discount_type === 'percent'
      ? originalPrice * Math.min(100, value) / 100
      : Math.min(originalPrice, value);
    discount = Math.round(discount * 100) / 100;
  }
  const totalPrice = Math.max(0, Math.round((originalPrice - discount) * 100) / 100);
  const status = totalPrice > 0 ? 0 : 1;
  const code = `MO${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const statements = [];
  let campaignIndex = -1;
  if (seckillId) {
    campaignIndex = statements.length;
    statements.push(c.env.DB.prepare(`UPDATE seckill_campaign SET inventory=inventory-? WHERE campaign_id=? AND goods_id=?
      AND status=1 AND inventory>=? AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>=?)`)
      .bind(quantity, seckillId, goodsId, quantity, now, now));
    statements.push(c.env.DB.prepare('UPDATE mall_goods SET inventory=inventory-? WHERE goods_id=? AND inventory>=? AND status=1 AND changes()=1')
      .bind(quantity, goodsId, quantity));
  } else {
    statements.push(c.env.DB.prepare('UPDATE mall_goods SET inventory=inventory-? WHERE goods_id=? AND inventory>=? AND status=1')
      .bind(quantity, goodsId, quantity));
  }
  const stockIndex = statements.length - 1;
  const pointsIndex = statements.length;
  statements.push(c.env.DB.prepare(`UPDATE user SET user_points=user_points-? WHERE user_id=? AND user_status=1
    AND user_points>=? AND changes()=1`).bind(totalPoints, userId, totalPoints));
  const orderIndex = statements.length;
  statements.push(c.env.DB.prepare(`INSERT INTO mall_order
    (order_code,user_id,goods_id,quantity,total_price,total_points,status,created_at,updated_at,user_coupon_id,discount_amount,seckill_id)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`)
    .bind(code, userId, goodsId, quantity, totalPrice, totalPoints, status, now, now, couponId, discount, seckillId));
  let order;
  try {
    order = await c.env.DB.batch(statements);
  } catch (error) {
    const detail = (error as Error).message;
    return c.json({ code: 409, msg: detail.includes('优惠券') ? '优惠券刚刚被其他订单占用，请刷新后重试'
      : detail.includes('秒杀') ? '秒杀活动已结束或库存不足' : '订单提交失败，请刷新后重试' }, 409);
  }
  const restoreStock = async () => {
    const restore = [c.env.DB.prepare('UPDATE mall_goods SET inventory=inventory+? WHERE goods_id=?').bind(quantity, goodsId)];
    if (seckillId) restore.push(c.env.DB.prepare('UPDATE seckill_campaign SET inventory=inventory+? WHERE campaign_id=?').bind(quantity, seckillId));
    await c.env.DB.batch(restore);
  };
  if (campaignIndex >= 0 && !order[campaignIndex]?.meta.changes) return c.json({ code: 409, msg: '秒杀活动已结束或库存不足' }, 409);
  if (!order[stockIndex]?.meta.changes) {
    if (campaignIndex >= 0) await c.env.DB.prepare('UPDATE seckill_campaign SET inventory=inventory+? WHERE campaign_id=?').bind(quantity, seckillId).run();
    return c.json({ code: 409, msg: '商品库存不足，请刷新后重试' }, 409);
  }
  if (!order[pointsIndex]?.meta.changes) {
    await restoreStock();
    return c.json({ code: 409, msg: '积分不足或账号状态异常' }, 409);
  }
  if (!order[orderIndex]?.meta.changes) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE user SET user_points=user_points+? WHERE user_id=?').bind(totalPoints, userId),
      c.env.DB.prepare('UPDATE mall_goods SET inventory=inventory+? WHERE goods_id=?').bind(quantity, goodsId),
      ...(seckillId ? [c.env.DB.prepare('UPDATE seckill_campaign SET inventory=inventory+? WHERE campaign_id=?').bind(quantity, seckillId)] : []),
    ]);
    return c.json({ code: 409, msg: '订单未能创建，已退还库存和积分' }, 409);
  }
  const orderId = Number(order[orderIndex].meta.last_row_id || 0);
  return c.json({ code: 0, msg: totalPrice > 0 ? '订单已创建，等待管理员核验收款' : '订单已确认',
    data: { order_id: orderId, order_code: code, status, total_price: totalPrice, total_points: totalPoints, discount_amount: discount, seckill_id: seckillId } });
});

apiRouter.post('/mall/orders/:id/cancel', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '订单编号无效' }, 400);
  const result = await c.env.DB.prepare(`UPDATE mall_order SET status=3,updated_at=?
    WHERE mall_order_id=? AND user_id=? AND status=0`).bind(Math.floor(Date.now() / 1000), id, userId).run();
  if (!result.meta.changes) return c.json({ code: 409, msg: '仅待核款订单可以取消，或订单状态已变化' }, 409);
  return c.json({ code: 0, msg: '订单已取消，积分、库存和优惠券已退回' });
});

apiRouter.get('/mall/orders', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请先登录' }, 401);
  const rows = await c.env.DB.prepare(`SELECT o.*,g.goods_name,g.goods_pic FROM mall_order o
    LEFT JOIN mall_goods g ON g.goods_id=o.goods_id WHERE o.user_id=? ORDER BY o.mall_order_id DESC LIMIT 100`).bind(userId).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.get('/notices', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const rows = await c.env.DB.prepare(`SELECT notice_id,title,content,notice_type,created_at FROM site_notice WHERE status=1
    AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>=?) ORDER BY notice_id DESC LIMIT 30`).bind(now, now).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.get('/danmaku/list', async (c) => {
  const vodId = Number(c.req.query('vod_id'));
  const episode = Math.max(0, Number(c.req.query('episode_id')) || 0);
  if (!Number.isInteger(vodId) || vodId <= 0) return c.json({ code: 400, msg: '影片 ID 无效' }, 400);
  const rows = await c.env.DB.prepare(`SELECT danmaku_id,user_name,position_ms,color,content FROM danmaku
    WHERE vod_id=? AND episode_id=? AND status=1 ORDER BY position_ms LIMIT 3000`).bind(vodId, episode).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/danmaku/add', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vodId = Number(body.vod_id);
  const content = String(body.content || '').trim();
  if (!Number.isInteger(vodId) || vodId <= 0 || !content || content.length > 120) return c.json({ code: 400, msg: '影片或弹幕内容无效' }, 400);
  const ip = c.req.header('CF-Connecting-IP') || '';
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM danmaku WHERE client_ip=? AND created_at>?').bind(ip, Math.floor(Date.now() / 1000) - 60).first<{ c: number }>();
  if ((recent?.c || 0) >= 5) return c.json({ code: 429, msg: '发送过于频繁，请稍后再试' }, 429);
  const userId = await getUserFromHeader(c);
  const user = userId ? await c.env.DB.prepare('SELECT user_name,user_nick FROM user WHERE user_id=? AND user_status=1').bind(userId).first<{ user_name: string; user_nick: string }>() : null;
  const config = await VodService.getConfigs(c.env.DB);
  const status = config.danmaku_audit === '0' ? 1 : 0;
  const result = await c.env.DB.prepare(`INSERT INTO danmaku (user_id,user_name,vod_id,episode_id,position_ms,color,content,status,client_ip,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(userId, user?.user_nick || user?.user_name || '访客', vodId, Math.max(0, Number(body.episode_id) || 0),
    Math.max(0, Number(body.position_ms) || 0), /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#ffffff', content, status, ip,
    Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: status ? '弹幕已发送' : '弹幕已提交，审核后显示', data: { danmaku_id: result.meta.last_row_id, status } });
});

apiRouter.get('/chatroom/messages', async (c) => {
  const room = String(c.req.query('room') || 'default').slice(0, 40);
  const after = Math.max(0, Number(c.req.query('after')) || 0);
  const rows = await c.env.DB.prepare(`SELECT message_id,user_name,content,created_at FROM chatroom_message
    WHERE room_key=? AND status=1 AND message_id>? ORDER BY message_id LIMIT 100`).bind(room, after).all();
  return c.json({ code: 0, data: rows.results || [] });
});

apiRouter.post('/chatroom/send', async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ code: 401, msg: '请登录后参与聊天室' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const content = String(body.content || '').trim();
  if (!content || content.length > 500) return c.json({ code: 400, msg: '消息须为 1–500 个字符' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const recent = await c.env.DB.prepare('SELECT message_id FROM chatroom_message WHERE user_id=? AND created_at>? ORDER BY message_id DESC LIMIT 1').bind(userId, now - 3).first();
  if (recent) return c.json({ code: 429, msg: '发送太快，请稍后再试' }, 429);
  const user = await c.env.DB.prepare('SELECT user_name,user_nick FROM user WHERE user_id=? AND user_status=1').bind(userId).first<{ user_name: string; user_nick: string }>();
  if (!user) return c.json({ code: 403, msg: '会员账号不可用' }, 403);
  const config = await VodService.getConfigs(c.env.DB);
  const status = config.chat_audit === '0' ? 1 : 0;
  const result = await c.env.DB.prepare(`INSERT INTO chatroom_message (room_key,user_id,user_name,content,status,created_at)
    VALUES (?,?,?,?,?,?)`).bind(String(body.room || 'default').slice(0, 40), userId, user.user_nick || user.user_name, content, status, now).run();
  return c.json({ code: 0, msg: status ? '消息已发送' : '消息已提交审核', data: { message_id: result.meta.last_row_id, status } });
});

apiRouter.post('/share', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = String(body.model || 'vod');
  if (!['vod','art','topic','actor','manga','website'].includes(model)) return c.json({ code: 400, msg: '分享模型无效' }, 400);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '内容 ID 无效' }, 400);
  await c.env.DB.prepare('INSERT INTO share_log (user_id,model,content_id,channel,client_ip,created_at) VALUES (?,?,?,?,?,?)')
    .bind(await getUserFromHeader(c), model, id, String(body.channel || '').slice(0, 40), c.req.header('CF-Connecting-IP') || '', Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '分享记录已保存' });
});

apiRouter.post('/vod/play-fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vodId = Number(body.vod_id) || 0;
  const name = String(body.vod_name || '').trim().slice(0, 240);
  const message = String(body.message || '').trim().slice(0, 1000);
  if (!name && !vodId) return c.json({ code: 400, msg: '请选择需要反馈的影片' }, 400);
  const ip = c.req.header('CF-Connecting-IP') || '';
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM vod_play_fail WHERE client_ip=? AND created_at>?').bind(ip, Math.floor(Date.now() / 1000) - 3600).first<{ c: number }>();
  if ((recent?.c || 0) >= 10) return c.json({ code: 429, msg: '报错反馈过于频繁' }, 429);
  const result = await c.env.DB.prepare(`INSERT INTO vod_play_fail (vod_id,vod_name,play_from,play_part,message,client_ip,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(vodId, name, String(body.play_from || '').slice(0, 80), String(body.play_part || '').slice(0, 120), message, ip,
    Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '播放故障已提交，感谢反馈', data: { fail_id: result.meta.last_row_id } });
});
