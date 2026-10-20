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
  const mid = parseInt(c.req.query('mid') || '1', 10);
  const rid = parseInt(c.req.query('rid') || '0', 10);
  const data = await VodService.getComments(c.env.DB, mid, rid);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/comment/add', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const ip = c.req.header('CF-Connecting-IP') || '';
    const id = await VodService.addComment(c.env.DB, {
      mid: parseInt(body.mid || '1', 10),
      rid: parseInt(body.rid || '0', 10),
      pid: parseInt(body.pid || '0', 10),
      userId: parseInt(body.user_id || '0', 10),
      name: body.name,
      ip,
      content: body.content,
    });
    return c.json({ code: 0, msg: '评论发表成功', data: { comment_id: id } });
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
  const body = await c.req.json().catch(() => ({}));
  try {
    const user = await UserService.register(c.env.DB, body);
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
