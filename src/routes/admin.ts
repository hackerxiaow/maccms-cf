// ========================================================
// 后台管理 API 路由 (全量对齐 MacCMS 10 & 8 管理体系)
// 包含批量运维、重名合并、字符替换、会员卡密、明星角色、报错受理等
// ========================================================

import { Hono } from 'hono';
import type { Bindings, CollectNodeItem, TypeBindItem, TypeItem, VodItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { VodService } from '../services/vod.ts';
import { CollectorService } from '../services/collector.ts';
import { ThemeService } from '../services/theme.ts';
import { UserService } from '../services/user.ts';
import { CardService } from '../services/card.ts';
import { ActorService } from '../services/actor.ts';
import { GbookService } from '../services/gbook.ts';
import { AdsService } from '../services/ads.ts';

export const adminRouter = new Hono<{ Bindings: Bindings }>();

// 动态派生 JWT 签名密钥
const getAdminSecret = (c: any, dbHash = ''): string => {
  return c.env.JWT_SECRET || (dbHash ? `MACCMS_${dbHash.slice(0, 16)}` : 'MACCMS_CLOUDFLARE_EDGE_SECRET_2026');
};

// 1. 管理员登录接口 (免验中间件)
adminRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  const configs = await VodService.getConfigs(c.env.DB);
  const correctUser = configs.admin_user || 'admin';
  const dbHash = configs.admin_pwd || '';
  const envPassword = c.env.ADMIN_PASSWORD;

  let isValid = false;
  const inputHash = await AuthUtils.sha256(password);

  if (envPassword) {
    isValid = (username === correctUser && password === envPassword);
  } else if (dbHash) {
    isValid = (username === correctUser && inputHash === dbHash);
  } else {
    // 默认初始账号密码: admin / admin888
    isValid = (username === 'admin' && (password === 'admin888' || inputHash === 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'));
  }

  if (!isValid) {
    return c.json({ code: 401, msg: '管理员账号或密码错误' }, 401);
  }

  const secret = getAdminSecret(c, dbHash);
  const token = await AuthUtils.generateToken(username, secret, 7);
  return c.json({
    code: 0,
    msg: '登录成功',
    data: {
      token,
      username,
    },
  });
});

// 2. 鉴权中间件 (保护所有后续 /api/admin/* 端点)
adminRouter.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return c.json({ code: 401, msg: '缺少管理员认证令牌，请重新登录' }, 401);
  }

  const configs = await VodService.getConfigs(c.env.DB);
  const secret = getAdminSecret(c, configs.admin_pwd || '');
  const check = await AuthUtils.verifyToken(token, secret);
  if (!check.valid) {
    return c.json({ code: 401, msg: '认证令牌已过期或无效，请重新登录' }, 401);
  }

  await next();
});

// 3. 控制台概览统计数据
adminRouter.get('/overview', async (c) => {
  const db = c.env.DB;

  const [
    countVod,
    countType,
    countNodes,
    countArt,
    countTopic,
    countActor,
    countUser,
    countGbook,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM vod').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM type').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM collect_node').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM art').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM topic').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM actor').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM user').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM gbook WHERE gbook_status = 1').first<{ c: number }>(),
  ]);

  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const countToday = await db.prepare('SELECT COUNT(*) as c FROM vod WHERE vod_time >= ?').bind(todayStart).first<{ c: number }>();

  return c.json({
    code: 0,
    data: {
      total_vod: countVod?.c || 0,
      total_type: countType?.c || 0,
      total_nodes: countNodes?.c || 0,
      total_art: countArt?.c || 0,
      total_topic: countTopic?.c || 0,
      total_actor: countActor?.c || 0,
      total_user: countUser?.c || 0,
      total_gbook: countGbook?.c || 0,
      today_updated: countToday?.c || 0,
    },
  });
});

// 4. 视频管理 API
adminRouter.get('/vod/list', async (c) => {
  const query = c.req.query();
  const page = parseInt(query.page || '1', 10);
  const limit = parseInt(query.limit || '15', 10);
  const typeId = query.type_id ? parseInt(query.type_id, 10) : undefined;
  const wd = query.wd;
  const level = query.level ? parseInt(query.level, 10) : undefined;
  const lock = query.lock !== undefined ? parseInt(query.lock, 10) : undefined;
  const status = query.status !== undefined ? parseInt(query.status, 10) : -1;

  const data = await VodService.queryVods(c.env.DB, {
    page,
    limit,
    typeId,
    wd,
    level,
    lock,
    status,
    by: 'id',
    order: 'desc',
  });

  return c.json({ code: 0, data });
});

adminRouter.get('/vod/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getVodDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '视频不存在' }, 404);
  return c.json({ code: 0, data });
});

adminRouter.post('/vod/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveVod(c.env.DB, body);
  return c.json({ code: 0, msg: '保存成功', data: { vod_id: id } });
});

adminRouter.delete('/vod/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteVod(c.env.DB, id);
  return c.json({ code: 0, msg: '删除成功' });
});

// 4.1 视频批量操作
adminRouter.post('/vod/batch/status', async (c) => {
  const body = await c.req.json();
  const count = await VodService.batchAuditVods(c.env.DB, body.ids || [], parseInt(body.status, 10));
  return c.json({ code: 0, msg: `已批量更新 ${count} 条记录状态` });
});

adminRouter.post('/vod/batch/level', async (c) => {
  const body = await c.req.json();
  const count = await VodService.batchSetVodLevel(c.env.DB, body.ids || [], parseInt(body.level, 10));
  return c.json({ code: 0, msg: `已批量设置 ${count} 条记录推荐星级` });
});

adminRouter.post('/vod/batch/lock', async (c) => {
  const body = await c.req.json();
  const count = await VodService.batchSetVodLock(c.env.DB, body.ids || [], parseInt(body.lock, 10));
  return c.json({ code: 0, msg: `已批量设置 ${count} 条记录锁定状态` });
});

adminRouter.post('/vod/batch/type', async (c) => {
  const body = await c.req.json();
  const count = await VodService.batchTransferVodType(c.env.DB, body.ids || [], parseInt(body.type_id, 10));
  return c.json({ code: 0, msg: `已批量迁移 ${count} 条记录分类` });
});

adminRouter.post('/vod/batch/del', async (c) => {
  const body = await c.req.json();
  const count = await VodService.batchDeleteVods(c.env.DB, body.ids || []);
  return c.json({ code: 0, msg: `已批量删除 ${count} 条记录` });
});

// 4.2 重名检测与合并
adminRouter.get('/vod/repeat/check', async (c) => {
  const data = await VodService.checkRepeatVods(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/vod/repeat/merge', async (c) => {
  const body = await c.req.json();
  const res = await VodService.mergeRepeatVods(c.env.DB, parseInt(body.master_id, 10), body.target_ids || []);
  return c.json({ code: 0, msg: `成功合并并清理了 ${res.merged} 条重复视频数据`, data: res });
});

// 4.3 数据库全局字符批量替换
adminRouter.post('/database/replace', async (c) => {
  const body = await c.req.json();
  try {
    const changes = await VodService.replaceDatabaseString(
      c.env.DB,
      body.table,
      body.column,
      body.search,
      body.replace || ''
    );
    return c.json({ code: 0, msg: `替换完成，共影响 ${changes} 行数据` });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

// 5. 分类管理 API
adminRouter.get('/type/list', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM type ORDER BY type_sort ASC, type_id ASC').all<TypeItem>();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/type/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveType(c.env.DB, body);
  return c.json({ code: 0, msg: '分类已保存', data: { type_id: id } });
});

adminRouter.delete('/type/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteType(c.env.DB, id);
  return c.json({ code: 0, msg: '分类已删除' });
});

// 6. 采集管理 API
adminRouter.get('/collect/node/list', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM collect_node ORDER BY id ASC').all<CollectNodeItem>();
  return c.json({ code: 0, data: rows.results || [] });
});
adminRouter.get('/collect/nodes', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM collect_node ORDER BY id ASC').all<CollectNodeItem>();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/collect/node/save', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  if (body.id && body.id > 0) {
    await db.prepare('UPDATE collect_node SET name = ?, api_url = ?, api_type = ?, filter_from = ?, filter_word = ?, cron_hours = ?, status = ? WHERE id = ?')
      .bind(body.name, body.api_url, body.api_type || 'json', body.filter_from || '', body.filter_word || '', body.cron_hours !== undefined ? body.cron_hours : 24, body.status !== undefined ? body.status : 1, body.id).run();
  } else {
    await db.prepare('INSERT INTO collect_node (name, api_url, api_type, filter_from, filter_word, cron_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(body.name, body.api_url, body.api_type || 'json', body.filter_from || '', body.filter_word || '', body.cron_hours !== undefined ? body.cron_hours : 24, body.status !== undefined ? body.status : 1).run();
  }
  return c.json({ code: 0, msg: '采集节点保存成功' });
});

adminRouter.delete('/collect/node/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM collect_node WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM type_bind WHERE source_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '采集节点已删除' });
});

adminRouter.get('/collect/classes/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const node = await c.env.DB.prepare('SELECT * FROM collect_node WHERE id = ?').bind(id).first<CollectNodeItem>();
  if (!node) return c.json({ code: 404, msg: '采集节点不存在' }, 404);
  try {
    const classes = await CollectorService.fetchRemoteClasses(node);
    return c.json({ code: 0, data: classes });
  } catch (err) {
    return c.json({ code: 500, msg: (err as Error).message }, 500);
  }
});
adminRouter.get('/collect/node/:id/remote-classes', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const node = await c.env.DB.prepare('SELECT * FROM collect_node WHERE id = ?').bind(id).first<CollectNodeItem>();
  if (!node) return c.json({ code: 404, msg: '采集节点不存在' }, 404);
  try {
    const classes = await CollectorService.fetchRemoteClasses(node);
    return c.json({ code: 0, data: classes });
  } catch (err) {
    return c.json({ code: 500, msg: (err as Error).message }, 500);
  }
});

adminRouter.get('/collect/bind/list', async (c) => {
  const nodeId = parseInt(c.req.query('node_id') || '0', 10);
  const rows = await c.env.DB.prepare('SELECT * FROM type_bind WHERE source_id = ?').bind(nodeId).all<TypeBindItem>();
  return c.json({ code: 0, data: rows.results || [] });
});
adminRouter.get('/collect/node/:id/binds', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const rows = await c.env.DB.prepare('SELECT * FROM type_bind WHERE source_id = ?').bind(id).all<TypeBindItem>();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/collect/bind/save', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  await db.prepare('INSERT INTO type_bind (source_id, source_type_id, source_type_name, local_type_id) VALUES (?, ?, ?, ?) ON CONFLICT(source_id, source_type_id) DO UPDATE SET local_type_id = ?, source_type_name = ?')
    .bind(body.source_id, body.source_type_id, body.source_type_name || '', body.local_type_id, body.local_type_id, body.source_type_name || '').run();
  return c.json({ code: 0, msg: '绑定保存成功' });
});

adminRouter.post('/collect/node/:id/binds', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const binds = Array.isArray(body.binds) ? body.binds : [];
  await db.prepare('DELETE FROM type_bind WHERE source_id = ?').bind(id).run();
  for (const b of binds) {
    const localTypeId = parseInt(b.local_type_id, 10);
    if (!localTypeId || localTypeId <= 0) continue;
    await db.prepare('INSERT INTO type_bind (source_id, source_type_id, source_type_name, local_type_id) VALUES (?, ?, ?, ?)')
      .bind(id, parseInt(b.source_type_id, 10), b.source_type_name || '', localTypeId).run();
  }
  return c.json({ code: 0, msg: `已保存 ${binds.length} 条分类映射` });
});

adminRouter.post('/collect/run/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const hours = body.hours !== undefined ? parseInt(body.hours, 10) : 24;
  const page = body.page !== undefined ? parseInt(body.page, 10) : 1;

  const node = await c.env.DB.prepare('SELECT * FROM collect_node WHERE id = ?').bind(id).first<CollectNodeItem>();
  if (!node) return c.json({ code: 404, msg: '节点不存在' }, 404);

  try {
    const res = await CollectorService.runCollectTask(c.env.DB, node, hours, page);
    return c.json({ code: 0, data: res });
  } catch (err) {
    return c.json({ code: 500, msg: (err as Error).message }, 500);
  }
});
adminRouter.post('/collect/node/:id/run', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const hours = body.hours !== undefined ? parseInt(body.hours, 10) : 24;
  const page = body.page !== undefined ? parseInt(body.page, 10) : 1;

  const node = await c.env.DB.prepare('SELECT * FROM collect_node WHERE id = ?').bind(id).first<CollectNodeItem>();
  if (!node) return c.json({ code: 404, msg: '节点不存在' }, 404);

  try {
    const res = await CollectorService.runCollectTask(c.env.DB, node, hours, page);
    return c.json({ code: 0, data: res });
  } catch (err) {
    return c.json({ code: 500, msg: (err as Error).message }, 500);
  }
});

adminRouter.post('/collect/run', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = parseInt(body.node_id, 10);
  if (!id) return c.json({ code: 400, msg: '缺少 node_id' }, 400);
  const node = await c.env.DB.prepare('SELECT * FROM collect_node WHERE id = ?').bind(id).first<CollectNodeItem>();
  if (!node) return c.json({ code: 404, msg: '节点不存在' }, 404);
  try {
    const res = await CollectorService.runCollectTask(c.env.DB, node, body.hours !== undefined ? parseInt(body.hours, 10) : 24, body.page !== undefined ? parseInt(body.page, 10) : 1);
    return c.json({ code: 0, data: res });
  } catch (err) {
    return c.json({ code: 500, msg: (err as Error).message }, 500);
  }
});

// 7. 播放器、下载器与服务器管理 API
adminRouter.get('/player/list', async (c) => {
  const data = await VodService.getAllPlayers(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/player/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.savePlayer(c.env.DB, body);
  return c.json({ code: 0, msg: '播放器保存成功', data: { id } });
});

adminRouter.delete('/player/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deletePlayer(c.env.DB, id);
  return c.json({ code: 0, msg: '删除播放器成功' });
});

adminRouter.get('/downer/list', async (c) => {
  const data = await VodService.getDowners(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/downer/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveDowner(c.env.DB, body);
  return c.json({ code: 0, msg: '下载器保存成功', data: { id } });
});

adminRouter.delete('/downer/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteDowner(c.env.DB, id);
  return c.json({ code: 0, msg: '下载器删除成功' });
});

adminRouter.get('/server/list', async (c) => {
  const data = await VodService.getServers(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/server/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveServer(c.env.DB, body);
  return c.json({ code: 0, msg: '服务器组保存成功', data: { id } });
});

adminRouter.delete('/server/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteServer(c.env.DB, id);
  return c.json({ code: 0, msg: '服务器组删除成功' });
});

// 8. 文章资讯管理 API
adminRouter.get('/art/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await VodService.queryArts(c.env.DB, { page, limit, wd: q.wd });
  return c.json({ code: 0, data });
});

adminRouter.get('/art/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getArtDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '文章不存在' }, 404);
  return c.json({ code: 0, data });
});

adminRouter.post('/art/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveArt(c.env.DB, body);
  return c.json({ code: 0, msg: '文章保存成功', data: { art_id: id } });
});

adminRouter.delete('/art/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteArt(c.env.DB, id);
  return c.json({ code: 0, msg: '文章删除成功' });
});

// 9. 影视专题管理 API
adminRouter.get('/topic/list', async (c) => {
  const data = await VodService.queryTopics(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.get('/topic/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await VodService.getTopicDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '专题不存在' }, 404);
  return c.json({ code: 0, data });
});

adminRouter.post('/topic/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveTopic(c.env.DB, body);
  return c.json({ code: 0, msg: '专题保存成功', data: { topic_id: id } });
});

adminRouter.delete('/topic/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteTopic(c.env.DB, id);
  return c.json({ code: 0, msg: '专题删除成功' });
});

// 10. 明星与角色管理 API
adminRouter.get('/actor/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await ActorService.queryActors(c.env.DB, { page, limit, wd: q.wd });
  return c.json({ code: 0, data });
});

adminRouter.get('/actor/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await ActorService.getActorDetail(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '明星不存在' }, 404);
  return c.json({ code: 0, data });
});

adminRouter.post('/actor/save', async (c) => {
  const body = await c.req.json();
  const id = await ActorService.saveActor(c.env.DB, body);
  return c.json({ code: 0, msg: '明星信息已保存', data: { actor_id: id } });
});

adminRouter.delete('/actor/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await ActorService.deleteActor(c.env.DB, id);
  return c.json({ code: 0, msg: '明星已删除' });
});

adminRouter.get('/role/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await ActorService.queryRoles(c.env.DB, { page, limit, wd: q.wd });
  return c.json({ code: 0, data });
});

adminRouter.post('/role/save', async (c) => {
  const body = await c.req.json();
  const id = await ActorService.saveRole(c.env.DB, body);
  return c.json({ code: 0, msg: '角色信息已保存', data: { role_id: id } });
});

adminRouter.delete('/role/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await ActorService.deleteRole(c.env.DB, id);
  return c.json({ code: 0, msg: '角色已删除' });
});

// 11. 会员中心管理 API
adminRouter.get('/user/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await UserService.queryUsers(c.env.DB, { page, limit, wd: q.wd });
  return c.json({ code: 0, data });
});

adminRouter.post('/user/save', async (c) => {
  const body = await c.req.json();
  const id = await UserService.saveUser(c.env.DB, body);
  return c.json({ code: 0, msg: '会员信息已更新', data: { user_id: id } });
});

adminRouter.delete('/user/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await UserService.deleteUser(c.env.DB, id);
  return c.json({ code: 0, msg: '会员账号已删除' });
});

adminRouter.get('/group/list', async (c) => {
  const data = await UserService.getUserGroups(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/group/save', async (c) => {
  const body = await c.req.json();
  const id = await UserService.saveUserGroup(c.env.DB, body);
  return c.json({ code: 0, msg: '会员组已保存', data: { group_id: id } });
});

// 12. 充值卡密管理 API
adminRouter.get('/card/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '20', 10);
  const status = q.status !== undefined ? parseInt(q.status, 10) : undefined;
  const data = await CardService.queryCards(c.env.DB, { page, limit, status, no: q.no });
  return c.json({ code: 0, data });
});

adminRouter.post('/card/generate', async (c) => {
  const body = await c.req.json();
  const count = parseInt(body.count || '10', 10);
  const points = parseInt(body.points || '100', 10);
  const money = parseFloat(body.money || '10');
  const cards = await CardService.generateCards(c.env.DB, count, points, money);
  return c.json({ code: 0, msg: `成功批量生成 ${cards.length} 张充值卡`, data: cards });
});

adminRouter.delete('/card/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await CardService.deleteCard(c.env.DB, id);
  return c.json({ code: 0, msg: '卡密已删除' });
});

// 13. 留言求片与播放器报错受理 API
adminRouter.get('/gbook/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '20', 10);
  const status = q.status !== undefined ? parseInt(q.status, 10) : undefined;
  const data = await GbookService.queryGbooks(c.env.DB, { page, limit, status });
  return c.json({ code: 0, data });
});

adminRouter.post('/gbook/reply', async (c) => {
  const body = await c.req.json();
  const id = parseInt(body.id, 10);
  await GbookService.replyGbook(c.env.DB, id, body.reply || '');
  return c.json({ code: 0, msg: '回复成功' });
});

adminRouter.delete('/gbook/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await GbookService.deleteGbook(c.env.DB, id);
  return c.json({ code: 0, msg: '已删除' });
});

// 14. 广告位管理 API
adminRouter.get('/ads/list', async (c) => {
  const data = await AdsService.getAllAds(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/ads/save', async (c) => {
  const body = await c.req.json();
  const id = await AdsService.saveAd(c.env.DB, body);
  return c.json({ code: 0, msg: '广告位已保存', data: { ads_id: id } });
});

adminRouter.delete('/ads/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await AdsService.deleteAd(c.env.DB, id);
  return c.json({ code: 0, msg: '广告位已删除' });
});

// 15. 评论互动管理 API (根据 comment_mid 关联相应名称)
adminRouter.get('/comment/list', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT
      c.*,
      CASE
        WHEN c.comment_mid = 1 THEN (SELECT v.vod_name FROM vod v WHERE v.vod_id = c.comment_rid)
        WHEN c.comment_mid = 2 THEN (SELECT a.art_name FROM art a WHERE a.art_id = c.comment_rid)
        WHEN c.comment_mid = 3 THEN (SELECT t.topic_name FROM topic t WHERE t.topic_id = c.comment_rid)
        ELSE ''
      END as target_name
    FROM comment c
    ORDER BY c.comment_id DESC
    LIMIT 60
  `).all();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.delete('/comment/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM comment WHERE comment_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '评论已删除' });
});

// 16. 友情链接 API
adminRouter.get('/link/list', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM link ORDER BY link_sort ASC, link_id ASC').all();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/link/save', async (c) => {
  const body = await c.req.json();
  const id = await VodService.saveLink(c.env.DB, body);
  return c.json({ code: 0, msg: '链接保存成功', data: { link_id: id } });
});

adminRouter.delete('/link/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await VodService.deleteLink(c.env.DB, id);
  return c.json({ code: 0, msg: '链接已删除' });
});

// 17. 海螺主题全局配置 API (120+ 项参数可视化)
adminRouter.get('/theme', async (c) => {
  const data = await ThemeService.getForAdmin(c.env.DB);
  return c.json({ code: 0, data });
});

adminRouter.post('/theme/save', async (c) => {
  const body = await c.req.json();
  const entries = body.entries || body;
  const count = await ThemeService.save(c.env.DB, entries);
  return c.json({ code: 0, msg: `主题配置已保存 (${count} 项)` });
});

adminRouter.post('/theme/reset', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await ThemeService.reset(c.env.DB, body.group);
  return c.json({ code: 0, msg: '主题配置已重置' });
});

// 18. 系统全局配置 API (密码安全落库)
adminRouter.get('/config', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  delete configs.admin_pwd;
  return c.json({ code: 0, data: configs });
});

adminRouter.post('/config', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;

  for (const [key, val] of Object.entries(body)) {
    if ((key === 'new_password' || key === 'admin_pwd') && typeof val === 'string' && val.trim()) {
      const hash = await AuthUtils.sha256(val.trim());
      await VodService.setConfig(db, 'admin_pwd', hash);
    } else if (key !== 'new_password' && key !== 'admin_pwd') {
      await VodService.setConfig(db, key, String(val));
    }
  }

  return c.json({ code: 0, msg: '系统配置已更新' });
});
