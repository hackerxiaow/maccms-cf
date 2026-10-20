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

export const apiRouter = new Hono<{ Bindings: Bindings }>();

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

  const data = await VodService.queryVods(c.env.DB, {
    page,
    limit,
    typeId,
    year,
    area,
    wd,
    letter,
    by,
    order,
    status: 1,
    vodClass: query.vod_class,
    vodLang: query.vod_lang,
    version: query.version,
    state: query.state,
    tag: query.tag,
    actor: query.actor,
    director: query.director,
    weekday: query.weekday !== undefined ? parseInt(query.weekday, 10) : undefined,
  });

  return c.json({
    code: 0,
    msg: 'ok',
    data,
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
  return c.json({ code: 0, msg: 'ok', data });
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

  const detail = await VodService.getVodDetail(c.env.DB, id);
  if (!detail) {
    return c.json({ code: 404, msg: '视频不存在或已下架' }, 404);
  }

  return c.json({ code: 0, msg: 'ok', data: detail });
});

// 5. 搜索联想补全接口
apiRouter.get('/vod/suggest', async (c) => {
  const wd = c.req.query('wd') || '';
  const suggestions = await VodService.getSuggestions(c.env.DB, wd, 8);
  return c.json({ code: 0, msg: 'ok', data: suggestions });
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

  // 解析会员 Token
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId = 0;
  if (token) {
    const check = await AuthUtils.verifyToken(token, 'MACCMS_USER_SECRET');
    if (check.valid && check.username) {
      userId = parseInt(check.username.replace('user_', ''), 10) || 0;
    }
  }

  const res = await UserService.checkPlayPermission(c.env.DB, userId, vodId, nid);
  return c.json({ code: res.canPlay ? 0 : 403, data: res });
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
  const data = await VodService.queryArts(c.env.DB, { page, limit, typeId, wd });
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.get('/art/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getArtDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '文章不存在' }, 404);
  return c.json({ code: 0, msg: 'ok', data });
});

// 10. 影视专题接口
apiRouter.get('/topic/list', async (c) => {
  const data = await VodService.queryTopics(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.get('/topic/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getTopicDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '专题不存在' }, 404);
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
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.get('/actor/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await ActorService.getActorDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '明星信息不存在' }, 404);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.get('/role/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '20', 10);
  const vodId = q.vod_id ? parseInt(q.vod_id, 10) : undefined;
  const actorId = q.actor_id ? parseInt(q.actor_id, 10) : undefined;
  const wd = q.wd;
  const data = await ActorService.queryRoles(c.env.DB, { page, limit, vodId, actorId, wd });
  return c.json({ code: 0, msg: 'ok', data });
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
  return c.json({ code: 0, msg: 'ok', data: { ...data, types } });
});

apiRouter.get('/website/detail/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的网址 ID' }, 400);
  const item = await WebsiteService.get(c.env.DB, id);
  if (!item || item.website_status !== 1) return c.json({ code: 404, msg: '网址不存在或已隐藏' }, 404);
  return c.json({ code: 0, msg: 'ok', data: item });
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
    const blocked = await c.env.DB.prepare(`SELECT reason FROM user_access_rule WHERE
      ((rule_type='ip' AND rule_value=?) OR (rule_type='username' AND lower(rule_value)=lower(?)))
      AND (expires_at=0 OR expires_at>?) LIMIT 1`).bind(ip, String(body.username || '').trim(), Math.floor(Date.now() / 1000)).first<{ reason: string }>();
    if (blocked) return c.json({ code: 403, msg: blocked.reason || '当前来源不可注册' }, 403);
    const user = await UserService.register(c.env.DB, body, ip);
    const token = await AuthUtils.generateToken(`user_${user.user_id}`, 'MACCMS_USER_SECRET', 30);
    return c.json({ code: 0, msg: '注册成功', data: { user, token } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

apiRouter.post('/user/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    const candidate = await c.env.DB.prepare('SELECT user_id FROM user WHERE user_name=?').bind(String(body.username || '').trim()).first<{ user_id: number }>();
    const blocked = await c.env.DB.prepare(`SELECT reason FROM user_access_rule WHERE
      ((rule_type='ip' AND rule_value=?) OR (rule_type='username' AND lower(rule_value)=lower(?)) OR (rule_type='user_id' AND rule_value=?))
      AND (expires_at=0 OR expires_at>?) LIMIT 1`).bind(ip, String(body.username || '').trim(), String(candidate?.user_id || ''), Math.floor(Date.now() / 1000)).first<{ reason: string }>();
    if (blocked) return c.json({ code: 403, msg: blocked.reason || '当前来源不可登录' }, 403);
    const data = await UserService.login(c.env.DB, body.username, body.password, ip);
    return c.json({ code: 0, msg: '登录成功', data });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

// 获取当前登录用户画像中间件辅助函数
const getUserFromHeader = async (c: any): Promise<number> => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return 0;
  const check = await AuthUtils.verifyToken(token, 'MACCMS_USER_SECRET');
  if (!check.valid || !check.username) return 0;
  return parseInt(check.username.replace('user_', ''), 10) || 0;
};

apiRouter.get('/manga/list', async (c) => {
  const q = c.req.query();
  const result = await MangaService.query(c.env.DB, { page: parseInt(q.page || '1', 10), limit: parseInt(q.limit || '20', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined, wd: q.wd, status: 1 });
  const types = await VodService.getTypes(c.env.DB, 12);
  const list = result.list.map((item) => {
    const { manga_chapter_url, manga_pwd, manga_pwd_url, manga_content, ...safe } = item as any;
    return { ...safe, chapter_count: (manga_chapter_url || '').split('$$$').join('#').split('#').filter(Boolean).length };
  });
  return c.json({ code: 0, data: { ...result, list, types } });
});

apiRouter.get('/manga/detail/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const item = await MangaService.get(c.env.DB, id);
  if (!item || item.manga_status !== 1 || Number((item as any).manga_recycle_time) > 0) return c.json({ code: 404, msg: '漫画不存在或已下架' }, 404);
  const { manga_chapter_url, manga_pwd, manga_pwd_url, ...safe } = item as any;
  const chapterCount = String(manga_chapter_url || '').split('$$$').join('#').split('#').filter(Boolean).length;
  return c.json({ code: 0, data: { ...safe, chapter_count: chapterCount } });
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
  return c.json({ code: 0, msg: 'ok', data: user });
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
  const mid = midByModel[model] || Number(body.mid);
  const rid = Number(body.id || body.rid);
  if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(rid) || rid <= 0 || mid > 20) return c.json({ code: 400, msg: '关注目标无效' }, 400);
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
