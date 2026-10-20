// ========================================================
// 现代 RESTful API 路由 (供前端页面、小程序与移动端 App 调用)
// ========================================================

import { Hono } from 'hono';
import { Bindings } from '../types';
import { VodService } from '../services/vod';
import { ThemeService } from '../services/theme';

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

  // 找出该分类及其父分类的扩展筛选定义
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

  // 从已有影片数据中提取实际存在的年份、地区、语言、类型分布
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

// 2. 巨幕轮播推荐 (Banner Spotlight)
apiRouter.get('/vod/banners', async (c) => {
  const data = await VodService.getBannerVods(c.env.DB, 5);
  return c.json({ code: 0, msg: 'ok', data });
});

// 3. 影视排行榜 (今日热播榜、周热榜、口碑高分榜)
apiRouter.get('/vod/rankings', async (c) => {
  const data = await VodService.getRankings(c.env.DB, 10);
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

  return c.json({
    code: 0,
    msg: 'ok',
    data: detail,
  });
});

// 5. 搜索联想补全接口 (毫秒级响应)
apiRouter.get('/vod/suggest', async (c) => {
  const wd = c.req.query('wd') || '';
  const suggestions = await VodService.getSuggestions(c.env.DB, wd, 8);
  return c.json({
    code: 0,
    msg: 'ok',
    data: suggestions,
  });
});

// 6. 分类树接口
apiRouter.get('/types', async (c) => {
  const types = await VodService.getTypes(c.env.DB);
  return c.json({
    code: 0,
    msg: 'ok',
    data: types,
  });
});

// 7. 文章资讯列表与详情
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

// 8. 影视专题列表与详情
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

// 9. 用户评论与互动
apiRouter.get('/comment/list', async (c) => {
  const mid = parseInt(c.req.query('mid') || '1', 10);
  const rid = parseInt(c.req.query('rid') || '0', 10);
  const data = await VodService.getComments(c.env.DB, mid, rid);
  return c.json({ code: 0, msg: 'ok', data });
});

apiRouter.post('/comment/add', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const id = await VodService.addComment(c.env.DB, {
      mid: parseInt(body.mid || '1', 10),
      rid: parseInt(body.rid || '0', 10),
      name: body.name,
      content: body.content,
    });
    return c.json({ code: 0, msg: '评论发表成功', data: { comment_id: id } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

// 10. 友情链接接口
apiRouter.get('/links', async (c) => {
  const data = await VodService.getLinks(c.env.DB);
  return c.json({ code: 0, msg: 'ok', data });
});

// 11. 播放器配置接口
apiRouter.get('/players', async (c) => {
  const players = await VodService.getPlayers(c.env.DB);
  return c.json({
    code: 0,
    msg: 'ok',
    data: players,
  });
});

// 6. 站点公开信息接口
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
