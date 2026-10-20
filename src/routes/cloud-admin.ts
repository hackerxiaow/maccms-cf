// Cloudflare-native MacCMS extensions: D1 operations, R2 media, moderation,
// lightweight commerce, scheduled work and administrator role management.
import { Hono } from 'hono';
import type { Bindings, CollectNodeItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { CollectorService } from '../services/collector.ts';

export const cloudAdminRouter = new Hono<{ Bindings: Bindings }>();

type Dataset = { table: string; id: string; search: string[]; status?: string };
const DATASETS: Record<string, Dataset> = {
  danmaku: { table: 'danmaku', id: 'danmaku_id', search: ['content', 'user_name'], status: 'status' },
  chat: { table: 'chatroom_message', id: 'message_id', search: ['content', 'user_name'], status: 'status' },
  messages: { table: 'user_pm', id: 'pm_id', search: ['content'], status: 'status' },
  shares: { table: 'share_log', id: 'share_id', search: ['model', 'channel'] },
  cash: { table: 'cash_log', id: 'cash_id', search: ['cash_type', 'note', 'operator'] },
  coupons: { table: 'coupon', id: 'coupon_id', search: ['coupon_code', 'coupon_name'], status: 'status' },
  goods: { table: 'mall_goods', id: 'goods_id', search: ['goods_name'], status: 'status' },
  'mall-orders': { table: 'mall_order', id: 'mall_order_id', search: ['order_code', 'note'], status: 'status' },
  notices: { table: 'site_notice', id: 'notice_id', search: ['title', 'content'], status: 'status' },
  signs: { table: 'sign_log', id: 'sign_id', search: ['sign_day'] },
  'play-fails': { table: 'vod_play_fail', id: 'fail_id', search: ['vod_name', 'message', 'play_from'], status: 'status' },
};

const MODELS: Record<string, { table: string; id: string }> = {
  vod: { table: 'vod', id: 'vod_id' }, art: { table: 'art', id: 'art_id' },
  topic: { table: 'topic', id: 'topic_id' }, manga: { table: 'manga', id: 'manga_id' },
  actor: { table: 'actor', id: 'actor_id' }, role: { table: 'role', id: 'role_id' },
  website: { table: 'website', id: 'website_id' },
};

const pageArgs = (query: Record<string, string | undefined>) => {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(query.limit || '30', 10) || 30));
  return { page, limit, offset: (page - 1) * limit };
};

cloudAdminRouter.get('/data/:resource', async (c) => {
  const resource = DATASETS[c.req.param('resource')];
  if (!resource) return c.json({ code: 404, msg: '未知数据模块' }, 404);
  const q = c.req.query();
  const { page, limit, offset } = pageArgs(q);
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const keyword = (q.wd || '').trim();
  if (keyword) {
    conditions.push(`(${resource.search.map((field) => `${field} LIKE ?`).join(' OR ')})`);
    resource.search.forEach(() => params.push(`%${keyword}%`));
  }
  if (resource.status && q.status !== undefined && q.status !== '') {
    conditions.push(`${resource.status} = ?`);
    const requestedStatus = Number(q.status);
    params.push(Number.isInteger(requestedStatus) ? requestedStatus : 0);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ${resource.table} ${where}`)
    .bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT * FROM ${resource.table} ${where}
    ORDER BY ${resource.id} DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

cloudAdminRouter.post('/data/:resource/status', async (c) => {
  const resource = DATASETS[c.req.param('resource')];
  if (!resource?.status) return c.json({ code: 400, msg: '该模块不支持状态切换' }, 400);
  if (c.req.param('resource') === 'mall-orders') return c.json({ code: 400, msg: '订单必须通过确认、完成或取消流程变更状态' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0))).slice(0, 200) : [];
  if (!ids.length) return c.json({ code: 400, msg: '请选择记录' }, 400);
  const status = Number(body.status) === 1 ? 1 : 0;
  await c.env.DB.prepare(`UPDATE ${resource.table} SET ${resource.status} = ? WHERE ${resource.id} IN (${ids.map(() => '?').join(',')})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已${status ? '启用/通过' : '停用/隐藏'} ${ids.length} 条记录` });
});

cloudAdminRouter.delete('/data/:resource/:id', async (c) => {
  const resource = DATASETS[c.req.param('resource')];
  const id = Number(c.req.param('id'));
  if (!resource || !Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '参数错误' }, 400);
  if (c.req.param('resource') === 'mall-orders') return c.json({ code: 400, msg: '订单需要保留流水，请通过订单状态流程处理' }, 400);
  await c.env.DB.prepare(`DELETE FROM ${resource.table} WHERE ${resource.id} = ?`).bind(id).run();
  return c.json({ code: 0, msg: '记录已删除' });
});

cloudAdminRouter.get('/seckill', async (c) => {
  const [campaigns, goods] = await Promise.all([
    c.env.DB.prepare(`SELECT s.*,g.goods_name,g.price AS goods_price,g.goods_pic FROM seckill_campaign s
      LEFT JOIN mall_goods g ON g.goods_id=s.goods_id ORDER BY s.campaign_id DESC`).all(),
    c.env.DB.prepare('SELECT goods_id,goods_name,price,inventory FROM mall_goods WHERE status=1 ORDER BY goods_id DESC').all(),
  ]);
  return c.json({ code: 0, data: { campaigns: campaigns.results || [], goods: goods.results || [] } });
});

cloudAdminRouter.post('/seckill/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.campaign_id) || 0;
  const name = String(body.campaign_name || '').trim().slice(0, 160);
  const goodsId = Math.trunc(Number(body.goods_id) || 0);
  const price = Math.max(0, Math.round((Number(body.sale_price) || 0) * 100) / 100);
  const inventory = Math.max(0, Math.trunc(Number(body.inventory) || 0));
  const starts = Math.max(0, Math.trunc(Number(body.starts_at) || 0));
  const ends = Math.max(0, Math.trunc(Number(body.ends_at) || 0));
  if (!name || goodsId <= 0 || (starts && ends && ends <= starts)) return c.json({ code: 400, msg: '活动名称、商品和有效时间范围必须填写' }, 400);
  const goods = await c.env.DB.prepare('SELECT price FROM mall_goods WHERE goods_id=? AND status=1').bind(goodsId).first<{ price: number }>();
  if (!goods) return c.json({ code: 404, msg: '商品不存在或已下架' }, 404);
  if (price > Number(goods.price)) return c.json({ code: 400, msg: '秒杀价不能高于商品原价' }, 400);
  const status = Number(body.status) === 0 ? 0 : 1;
  if (id) {
    const saved = await c.env.DB.prepare(`UPDATE seckill_campaign SET campaign_name=?,goods_id=?,sale_price=?,inventory=?,starts_at=?,ends_at=?,status=?
      WHERE campaign_id=?`).bind(name, goodsId, price, inventory, starts, ends, status, id).run();
    if (!saved.meta.changes) return c.json({ code: 404, msg: '秒杀活动不存在' }, 404);
  } else {
    await c.env.DB.prepare(`INSERT INTO seckill_campaign (campaign_name,goods_id,sale_price,inventory,starts_at,ends_at,status,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(name, goodsId, price, inventory, starts, ends, status, Math.floor(Date.now() / 1000)).run();
  }
  return c.json({ code: 0, msg: '秒杀活动已保存' });
});

cloudAdminRouter.delete('/seckill/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const hasOrders = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM mall_order WHERE seckill_id=?').bind(id).first<{ c: number }>();
  if ((hasOrders?.c || 0) > 0) return c.json({ code: 409, msg: '活动已有订单记录，请停用活动以保留订单信息' }, 409);
  await c.env.DB.prepare('DELETE FROM seckill_campaign WHERE campaign_id=?').bind(id).run();
  return c.json({ code: 0, msg: '秒杀活动已删除' });
});

cloudAdminRouter.post('/orders/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const target = Number(body.status);
  if (!Number.isInteger(id) || id <= 0 || ![1, 2, 3].includes(target)) return c.json({ code: 400, msg: '订单或目标状态无效' }, 400);
  const expected = target === 2 ? 1 : 0;
  const result = await c.env.DB.prepare('UPDATE mall_order SET status=?,updated_at=? WHERE mall_order_id=? AND status=?')
    .bind(target, Math.floor(Date.now() / 1000), id, expected).run();
  if (!result.meta.changes) return c.json({ code: 409, msg: '订单状态已变化，刷新后重试' }, 409);
  const labels: Record<number, string> = { 1: '已确认收款', 2: '已完成履约', 3: '已取消并退回积分、库存和优惠券' };
  return c.json({ code: 0, msg: labels[target] });
});

cloudAdminRouter.post('/data/:resource/save', async (c) => {
  const resource = c.req.param('resource');
  const body = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  let table = '';
  let idColumn = '';
  let columns: string[] = [];
  let values: unknown[] = [];
  let id = Number(body.id) || 0;
  if (resource === 'coupons') {
    table = 'coupon'; idColumn = 'coupon_id';
    columns = ['coupon_code','coupon_name','discount_type','discount_value','min_spend','max_uses','starts_at','ends_at','status'];
    values = [String(body.coupon_code || '').trim().toUpperCase(), String(body.coupon_name || '').trim(), body.discount_type === 'percent' ? 'percent' : 'fixed',
      Math.max(0, Number(body.discount_value) || 0), Math.max(0, Number(body.min_spend) || 0), Math.max(1, Number(body.max_uses) || 1),
      Math.max(0, Number(body.starts_at) || 0), Math.max(0, Number(body.ends_at) || 0), Number(body.status) === 0 ? 0 : 1];
    if (!values[0]) values[0] = `MC${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    if (!values[1]) return c.json({ code: 400, msg: '优惠券名称不能为空' }, 400);
  } else if (resource === 'goods') {
    table = 'mall_goods'; idColumn = 'goods_id';
    columns = ['goods_name','goods_desc','goods_pic','price','points','inventory','status','sort'];
    values = [String(body.goods_name || '').trim(), String(body.goods_desc || ''), String(body.goods_pic || ''), Math.max(0, Number(body.price) || 0),
      Math.max(0, parseInt(body.points, 10) || 0), Math.max(0, parseInt(body.inventory, 10) || 0), Number(body.status) === 0 ? 0 : 1, parseInt(body.sort, 10) || 0];
    if (!values[0]) return c.json({ code: 400, msg: '商品名称不能为空' }, 400);
  } else if (resource === 'notices') {
    table = 'site_notice'; idColumn = 'notice_id';
    columns = ['title','content','notice_type','status','starts_at','ends_at'];
    values = [String(body.title || '').trim(), String(body.content || ''), String(body.notice_type || 'site').slice(0, 24), Number(body.status) === 0 ? 0 : 1,
      Math.max(0, Number(body.starts_at) || 0), Math.max(0, Number(body.ends_at) || 0)];
    if (!values[0]) return c.json({ code: 400, msg: '公告标题不能为空' }, 400);
  } else {
    return c.json({ code: 404, msg: '该模块不支持编辑' }, 404);
  }
  if (id > 0) {
    const setters = columns.map((column) => `${column} = ?`).join(', ');
    await c.env.DB.prepare(`UPDATE ${table} SET ${setters} WHERE ${idColumn} = ?`).bind(...values, id).run();
  } else {
    const insertColumns = [...columns, 'created_at'];
    await c.env.DB.prepare(`INSERT INTO ${table} (${insertColumns.join(',')}) VALUES (${insertColumns.map(() => '?').join(',')})`)
      .bind(...values, now).run();
  }
  return c.json({ code: 0, msg: '已保存' });
});

cloudAdminRouter.post('/cash/adjust', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = Number(body.user_id);
  const points = Math.max(-50000, Math.min(50000, Math.trunc(Number(body.points) || 0)));
  const amount = Math.max(-100000, Math.min(100000, Number(body.amount) || 0));
  if (!Number.isInteger(userId) || userId <= 0 || (!points && !amount)) return c.json({ code: 400, msg: '会员 ID 有效且积分或记账金额至少填写一项' }, 400);
  const admin = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_user'").first<{ value: string }>();
  const user = await c.env.DB.prepare('SELECT user_points FROM user WHERE user_id=?').bind(userId).first<{ user_points: number }>();
  if (!user) return c.json({ code: 404, msg: '会员不存在' }, 404);
  if (points && user.user_points + points < 0) return c.json({ code: 400, msg: '调整后积分不能小于 0' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const statements = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE user SET user_points=user_points+? WHERE user_id=? AND user_points+?>=0').bind(points, userId, points),
    c.env.DB.prepare(`INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
      SELECT ?,'admin_adjustment',?,?,1,?,?,? WHERE changes()=1`)
      .bind(userId, amount, points, String(body.note || '').slice(0, 500), admin?.value || 'admin', now),
  ]);
  if (!statements[0]?.meta.changes) return c.json({ code: 409, msg: '积分余额已变化，请刷新后重试' }, 409);
  return c.json({ code: 0, msg: `已调整积分 ${points}，余额 ${user.user_points + points}` });
});

cloudAdminRouter.get('/accounts/roles', async (c) => {
  const rows = await c.env.DB.prepare('SELECT role_key, role_name, permissions FROM admin_role WHERE role_status = 1 ORDER BY role_id').all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.get('/sign-milestones', async (c) => {
  const [milestones, signs, claims] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM sign_milestone ORDER BY sign_days').all(),
    c.env.DB.prepare(`SELECT s.*,u.user_name FROM sign_log s LEFT JOIN user u ON u.user_id=s.user_id
      ORDER BY s.sign_id DESC LIMIT 100`).all(),
    c.env.DB.prepare(`SELECT m.*,u.user_name FROM user_sign_milestone m LEFT JOIN user u ON u.user_id=m.user_id
      ORDER BY m.claim_id DESC LIMIT 100`).all(),
  ]);
  return c.json({ code: 0, data: { milestones: milestones.results || [], signs: signs.results || [], claims: claims.results || [] } });
});

cloudAdminRouter.post('/sign-milestones', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.milestone_id) || 0;
  const days = Math.max(2, Math.min(365, Math.trunc(Number(body.sign_days) || 0)));
  const name = String(body.reward_name || '').trim().slice(0, 120);
  const points = Math.max(0, Math.min(100000, Math.trunc(Number(body.reward_points) || 0)));
  if (!name || !Number(body.sign_days)) return c.json({ code: 400, msg: '请填写有效的连续签到天数和奖励名称' }, 400);
  const status = Number(body.status) === 0 ? 0 : 1;
  if (id) {
    const updated = await c.env.DB.prepare(`UPDATE sign_milestone SET sign_days=?,reward_name=?,reward_points=?,status=?
      WHERE milestone_id=?`).bind(days, name, points, status, id).run();
    if (!updated.meta.changes) return c.json({ code: 404, msg: '签到里程碑不存在' }, 404);
  } else {
    await c.env.DB.prepare(`INSERT INTO sign_milestone (sign_days,reward_name,reward_points,status,created_at)
      VALUES (?,?,?,?,?)`).bind(days, name, points, status, Math.floor(Date.now() / 1000)).run();
  }
  return c.json({ code: 0, msg: '连续签到奖励已保存' });
});

cloudAdminRouter.delete('/sign-milestones/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const claimed = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM user_sign_milestone WHERE milestone_id=?').bind(id).first<{ c: number }>();
  if ((claimed?.c || 0) > 0) return c.json({ code: 409, msg: '已有会员领取此奖励，停用即可保留审计记录' }, 409);
  await c.env.DB.prepare('DELETE FROM sign_milestone WHERE milestone_id=?').bind(id).run();
  return c.json({ code: 0, msg: '连续签到奖励已删除' });
});

cloudAdminRouter.post('/accounts/roles', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.role_key || '').trim().toLowerCase();
  const name = String(body.role_name || '').trim();
  const allowed = new Set(['content','collect','users','ops','system']);
  const permissions = Array.isArray(body.permissions) ? Array.from(new Set(body.permissions.filter((value: unknown) => allowed.has(String(value))))) : [];
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key) || key === 'administrator') return c.json({ code: 400, msg: '角色标识无效或保留给主管理员' }, 400);
  if (!name) return c.json({ code: 400, msg: '角色名称不能为空' }, 400);
  const prior = await c.env.DB.prepare('SELECT role_id FROM admin_role WHERE role_key=?').bind(key).first<{ role_id: number }>();
  if (prior) await c.env.DB.prepare('UPDATE admin_role SET role_name=?,permissions=?,role_status=1 WHERE role_key=?')
    .bind(name, JSON.stringify(permissions), key).run();
  else await c.env.DB.prepare('INSERT INTO admin_role (role_key,role_name,permissions) VALUES (?,?,?)')
    .bind(key, name, JSON.stringify(permissions)).run();
  return c.json({ code: 0, msg: '管理员角色已保存' });
});

cloudAdminRouter.delete('/accounts/roles/:key', async (c) => {
  const key = c.req.param('key');
  if (key === 'administrator') return c.json({ code: 400, msg: '不能删除主管理员角色' }, 400);
  const used = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM admin_account WHERE role_key=?').bind(key).first<{ c: number }>();
  if ((used?.c || 0) > 0) return c.json({ code: 409, msg: '仍有管理员账号使用该角色' }, 409);
  await c.env.DB.prepare('DELETE FROM admin_role WHERE role_key=?').bind(key).run();
  return c.json({ code: 0, msg: '角色已删除' });
});

cloudAdminRouter.get('/accounts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT a.admin_id, a.username, a.role_key, r.role_name, a.status,
    a.created_at, a.updated_at, a.last_login_at FROM admin_account a
    LEFT JOIN admin_role r ON r.role_key = a.role_key ORDER BY a.admin_id`).all();
  const configs = await c.env.DB.prepare("SELECT value FROM config WHERE key = 'admin_user'").first<{ value: string }>();
  const primary = configs?.value || 'admin';
  const exists = (rows.results || []).some((row: any) => row.username === primary);
  const list = [...(rows.results || [])];
  if (!exists) list.unshift({ admin_id: 0, username: primary, role_key: 'administrator', role_name: '超级管理员（主账号）', status: 1, created_at: 0, updated_at: 0, last_login_at: 0 });
  return c.json({ code: 0, data: list });
});

cloudAdminRouter.post('/accounts/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.admin_id) || 0;
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const roleKey = String(body.role_key || 'editor');
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) return c.json({ code: 400, msg: '账号须为 3–32 位字母、数字、点、下划线或连字符' }, 400);
  const primary = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_user'").first<{ value: string }>();
  if (username === (primary?.value || 'admin')) return c.json({ code: 400, msg: '该账号由系统设置作为主管理员保留' }, 400);
  const role = await c.env.DB.prepare('SELECT role_key FROM admin_role WHERE role_key = ? AND role_status = 1').bind(roleKey).first();
  if (!role) return c.json({ code: 400, msg: '管理员角色无效' }, 400);
  if (!id && password.length < 8) return c.json({ code: 400, msg: '新管理员密码至少 8 位' }, 400);
  if (password && password.length < 8) return c.json({ code: 400, msg: '密码至少 8 位' }, 400);
  const now = Math.floor(Date.now() / 1000);
  if (id) {
    if (password) await c.env.DB.prepare(`UPDATE admin_account SET username = ?, password_hash = ?, role_key = ?, status = ?, updated_at = ? WHERE admin_id = ?`)
      .bind(username, await AuthUtils.sha256(password), roleKey, Number(body.status) === 0 ? 0 : 1, now, id).run();
    else await c.env.DB.prepare(`UPDATE admin_account SET username = ?, role_key = ?, status = ?, updated_at = ? WHERE admin_id = ?`)
      .bind(username, roleKey, Number(body.status) === 0 ? 0 : 1, now, id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO admin_account (username, password_hash, role_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(username, await AuthUtils.sha256(password), roleKey, Number(body.status) === 0 ? 0 : 1, now, now).run();
  }
  return c.json({ code: 0, msg: '管理员账号已保存' });
});

cloudAdminRouter.delete('/accounts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '不能删除配置中的主管理员账号' }, 400);
  const account = await c.env.DB.prepare('SELECT role_key FROM admin_account WHERE admin_id = ?').bind(id).first<{ role_key: string }>();
  if (!account) return c.json({ code: 404, msg: '管理员不存在' }, 404);
  if (account.role_key === 'administrator') {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM admin_account WHERE role_key = 'administrator' AND status = 1").first<{ c: number }>();
    if ((count?.c || 0) <= 1) return c.json({ code: 400, msg: '至少保留一个启用的超级管理员' }, 400);
  }
  await c.env.DB.prepare('DELETE FROM admin_account WHERE admin_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '管理员账号已删除' });
});

cloudAdminRouter.get('/monitor', async (c) => {
  const tableNames = ['vod','art','topic','manga','actor','role','website','user','collect_node','comment','gbook','live_channel','media_asset'];
  const counts = await Promise.all(tableNames.map(async (table) => {
    try {
      const row = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();
      return { table, count: row?.c || 0, healthy: true };
    } catch (error) {
      return { table, count: 0, healthy: false, error: (error as Error).message };
    }
  }));
  let d1 = false;
  try { await c.env.DB.prepare('SELECT 1 AS ok').first(); d1 = true; } catch {}
  const queue = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM scheduled_task WHERE enabled = 1').first<{ c: number }>().catch(() => ({ c: 0 }));
  return c.json({ code: 0, data: { checked_at: Math.floor(Date.now() / 1000), d1, r2: !!c.env.MEDIA_BUCKET,
    runtime: 'Cloudflare Workers / Pages + D1', scheduled_tasks: queue?.c || 0, tables: counts } });
});

cloudAdminRouter.get('/access-rules', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM user_access_rule ORDER BY rule_id DESC').all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.post('/access-rules', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const kind = body.rule_type === 'username' ? 'username' : body.rule_type === 'user_id' ? 'user_id' : 'ip';
  const value = String(body.rule_value || '').trim().slice(0, 128);
  if (!value || (kind === 'ip' && !/^[0-9a-f:.]+$/i.test(value))) return c.json({ code: 400, msg: '访问规则值无效' }, 400);
  await c.env.DB.prepare(`INSERT INTO user_access_rule (rule_type,rule_value,reason,expires_at,created_at)
    VALUES (?,?,?,?,?) ON CONFLICT(rule_type,rule_value) DO UPDATE SET reason=excluded.reason,expires_at=excluded.expires_at`)
    .bind(kind, value, String(body.reason || '').slice(0, 300), Math.max(0, Number(body.expires_at) || 0), Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '会员访问规则已保存' });
});

cloudAdminRouter.delete('/access-rules/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM user_access_rule WHERE rule_id=?').bind(Number(c.req.param('id'))).run();
  return c.json({ code: 0, msg: '访问限制已解除' });
});

cloudAdminRouter.get('/recycle', async (c) => {
  const { page, limit, offset } = pageArgs(c.req.query());
  const model = c.req.query('model');
  const where = model ? 'WHERE model=? AND restored_at=0' : 'WHERE restored_at=0';
  const values = model ? [model] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM recycle_bin ${where}`).bind(...values).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT recycle_id,model,record_id,deleted_by,deleted_at FROM recycle_bin ${where}
    ORDER BY recycle_id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

cloudAdminRouter.post('/recycle/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT * FROM recycle_bin WHERE recycle_id=? AND restored_at=0').bind(id).first<any>();
  if (!row) return c.json({ code: 404, msg: '回收站记录不存在或已还原' }, 404);
  const model = MODELS[row.model];
  if (!model) return c.json({ code: 400, msg: '此模型无法还原' }, 400);
  let record: Record<string, unknown>;
  try { record = JSON.parse(row.record_json); } catch { return c.json({ code: 400, msg: '回收记录数据损坏' }, 400); }
  const columns = await c.env.DB.prepare(`PRAGMA table_info(${model.table})`).all<{ name: string }>();
  const allowed = new Set((columns.results || []).map((column) => column.name));
  const keys = Object.keys(record).filter((key) => allowed.has(key));
  if (!keys.includes(model.id)) return c.json({ code: 400, msg: '回收记录缺少主键，无法还原' }, 400);
  await c.env.DB.prepare(`INSERT OR REPLACE INTO ${model.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .bind(...keys.map((key) => record[key] == null ? '' : record[key])).run();
  await c.env.DB.prepare('UPDATE recycle_bin SET restored_at=? WHERE recycle_id=?').bind(Math.floor(Date.now() / 1000), id).run();
  return c.json({ code: 0, msg: `${row.model} #${row.record_id} 已还原` });
});

cloudAdminRouter.delete('/recycle/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM recycle_bin WHERE recycle_id=?').bind(Number(c.req.param('id'))).run();
  return c.json({ code: 0, msg: '回收记录已永久清除' });
});

cloudAdminRouter.get('/media', async (c) => {
  const { page, limit, offset } = pageArgs(c.req.query());
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM media_asset').first<{ c: number }>();
  const rows = await c.env.DB.prepare('SELECT * FROM media_asset ORDER BY media_id DESC LIMIT ? OFFSET ?').bind(limit, offset).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [], bucket_ready: !!c.env.MEDIA_BUCKET } });
});

cloudAdminRouter.post('/media', async (c) => {
  const bucket = c.env.MEDIA_BUCKET;
  if (!bucket) return c.json({ code: 503, msg: '尚未绑定 R2 媒体桶；请在 wrangler.toml 配置 MEDIA_BUCKET' }, 503);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ code: 400, msg: '请选择图片文件' }, 400);
  const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
  if (!allowed.has(file.type)) return c.json({ code: 400, msg: '仅支持 JPEG、PNG、WebP、GIF、AVIF 图片' }, 400);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return c.json({ code: 413, msg: '图片大小须在 10 MB 以内' }, 413);
  const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  const origin = new URL(c.req.url).origin;
  const url = `${origin}/media/${key}`;
  const configs = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_pwd'").first<{ value: string }>();
  const passwordHash = configs?.value || '';
  const secret = c.env.JWT_SECRET || (passwordHash ? `MACCMS_${passwordHash.slice(0, 16)}` : 'MACCMS_CLOUDFLARE_EDGE_SECRET_2026');
  const auth = await AuthUtils.verifyToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, ''), secret);
  const admin = auth.username || 'admin';
  const result = await c.env.DB.prepare(`INSERT INTO media_asset (object_key,file_name,content_type,file_size,public_url,created_by,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(key, file.name.slice(0, 240), file.type, file.size, url, admin, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '图片已上传到 R2', data: { media_id: result.meta.last_row_id, object_key: key, public_url: url } });
});

cloudAdminRouter.delete('/media/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const media = await c.env.DB.prepare('SELECT object_key FROM media_asset WHERE media_id = ?').bind(id).first<{ object_key: string }>();
  if (!media) return c.json({ code: 404, msg: '媒体文件不存在' }, 404);
  if (c.env.MEDIA_BUCKET) await c.env.MEDIA_BUCKET.delete(media.object_key);
  await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '媒体文件已删除' });
});

cloudAdminRouter.get('/quality/rules', async (c) => {
  const [rules, issues] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM content_check_rule ORDER BY rule_id DESC').all(),
    c.env.DB.prepare(`SELECT * FROM content_check_issue WHERE status = 0 ORDER BY issue_id DESC LIMIT 100`).all(),
  ]);
  return c.json({ code: 0, data: { rules: rules.results || [], issues: issues.results || [] } });
});

cloudAdminRouter.post('/quality/rules/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const fields: Record<string, string[]> = { vod: ['vod_name','vod_sub','vod_actor','vod_director','vod_blurb','vod_content','vod_pic','vod_play_url'],
    art: ['art_name','art_author','art_blurb','art_content','art_pic'], topic: ['topic_name','topic_blurb','topic_content','topic_pic'],
    manga: ['manga_name','manga_author','manga_blurb','manga_content','manga_pic'], actor: ['actor_name','actor_blurb','actor_content','actor_pic'],
    website: ['website_name','website_url','website_sub','website_pic','website_logo'] };
  const model = String(body.model || 'vod');
  const field = String(body.field_name || 'vod_name');
  if (!fields[model]?.includes(field)) return c.json({ code: 400, msg: '模型或字段不受支持' }, 400);
  const name = String(body.rule_name || '').trim();
  const match = String(body.match_text || '').trim();
  if (!name || !match) return c.json({ code: 400, msg: '规则名称和匹配文本不能为空' }, 400);
  const id = Number(body.rule_id) || 0;
  const params = [name, model, field, match.slice(0, 240), body.severity === 'block' ? 'block' : 'warning', Number(body.status) === 0 ? 0 : 1];
  if (id) await c.env.DB.prepare(`UPDATE content_check_rule SET rule_name=?,model=?,field_name=?,match_text=?,severity=?,status=? WHERE rule_id=?`).bind(...params, id).run();
  else await c.env.DB.prepare(`INSERT INTO content_check_rule (rule_name,model,field_name,match_text,severity,status,created_at) VALUES (?,?,?,?,?,?,?)`).bind(...params, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '质检规则已保存' });
});

cloudAdminRouter.delete('/quality/rules/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM content_check_issue WHERE rule_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM content_check_rule WHERE rule_id = ?').bind(id),
  ]);
  return c.json({ code: 0, msg: '规则及相关待处理记录已删除' });
});

cloudAdminRouter.post('/quality/run', async (c) => {
  const models: Record<string, { table: string; id: string; name: string }> = {
    vod: { table: 'vod', id: 'vod_id', name: 'vod_name' }, art: { table: 'art', id: 'art_id', name: 'art_name' },
    topic: { table: 'topic', id: 'topic_id', name: 'topic_name' }, manga: { table: 'manga', id: 'manga_id', name: 'manga_name' },
    actor: { table: 'actor', id: 'actor_id', name: 'actor_name' }, website: { table: 'website', id: 'website_id', name: 'website_name' },
  };
  const rules = await c.env.DB.prepare('SELECT * FROM content_check_rule WHERE status = 1 ORDER BY rule_id').all<any>();
  const allowedFields: Record<string, string[]> = {
    vod: ['vod_name','vod_sub','vod_actor','vod_director','vod_blurb','vod_content','vod_pic','vod_play_url'],
    art: ['art_name','art_author','art_blurb','art_content','art_pic'], topic: ['topic_name','topic_blurb','topic_content','topic_pic'],
    manga: ['manga_name','manga_author','manga_blurb','manga_content','manga_pic'], actor: ['actor_name','actor_blurb','actor_content','actor_pic'],
    website: ['website_name','website_url','website_sub','website_pic','website_logo'],
  };
  const now = Math.floor(Date.now() / 1000);
  let inspected = 0;
  let found = 0;
  for (const rule of rules.results || []) {
    const model = models[rule.model];
    if (!model || !allowedFields[rule.model]?.includes(String(rule.field_name))) continue;
    const rows = await c.env.DB.prepare(`SELECT ${model.id} AS content_id, ${model.name} AS content_name, ${rule.field_name} AS field_value
      FROM ${model.table} ORDER BY ${model.id} DESC LIMIT 500`).all<any>();
    for (const row of rows.results || []) {
      inspected++;
      const value = String(row.field_value || '');
      const at = value.toLocaleLowerCase().indexOf(String(rule.match_text).toLocaleLowerCase());
      if (at < 0) continue;
      found++;
      await c.env.DB.prepare(`INSERT OR IGNORE INTO content_check_issue
        (rule_id,model,content_id,content_name,field_name,excerpt,status,created_at) VALUES (?,?,?,?,?,?,0,?)`)
        .bind(rule.rule_id, rule.model, row.content_id, String(row.content_name || '').slice(0, 240), rule.field_name, value.slice(Math.max(0, at - 40), at + 160), now).run();
    }
  }
  return c.json({ code: 0, msg: `检查完成：扫描 ${inspected} 项，发现 ${found} 处命中`, data: { inspected, found } });
});

cloudAdminRouter.post('/quality/issues/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare('UPDATE content_check_issue SET status = ? WHERE issue_id = ?').bind(Number(body.status) === 1 ? 1 : 0, id).run();
  return c.json({ code: 0, msg: '质检记录状态已更新' });
});

cloudAdminRouter.get('/tasks', async (c) => {
  const [tasks, logs, nodes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM scheduled_task ORDER BY task_id DESC').all(),
    c.env.DB.prepare('SELECT * FROM scheduled_task_log ORDER BY task_log_id DESC LIMIT 50').all(),
    c.env.DB.prepare('SELECT id, name FROM collect_node ORDER BY name').all(),
  ]);
  return c.json({ code: 0, data: { tasks: tasks.results || [], logs: logs.results || [], nodes: nodes.results || [], cron: '*/5 * * * *' } });
});

cloudAdminRouter.post('/tasks/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.task_name || '').trim();
  const type = ['collect_node','cleanup_logs','reset_hits'].includes(body.task_type) ? body.task_type : 'collect_node';
  const interval = Math.min(10080, Math.max(5, parseInt(body.interval_minutes, 10) || 60));
  const nodeId = Math.max(0, parseInt(body.node_id, 10) || 0);
  if (!name) return c.json({ code: 400, msg: '任务名称不能为空' }, 400);
  if (type === 'collect_node' && !nodeId) return c.json({ code: 400, msg: '采集任务请选择资源站' }, 400);
  const id = Number(body.task_id) || 0;
  const enabled = Number(body.enabled) === 0 ? 0 : 1;
  const nextRun = Math.floor(Date.now() / 1000) + interval * 60;
  if (id) await c.env.DB.prepare(`UPDATE scheduled_task SET task_name=?,task_type=?,node_id=?,interval_minutes=?,enabled=?,next_run_at=? WHERE task_id=?`)
    .bind(name, type, nodeId, interval, enabled, nextRun, id).run();
  else await c.env.DB.prepare(`INSERT INTO scheduled_task (task_name,task_type,node_id,interval_minutes,enabled,next_run_at,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(name, type, nodeId, interval, enabled, nextRun, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '边缘定时任务已保存' });
});

cloudAdminRouter.delete('/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM scheduled_task WHERE task_id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ code: 0, msg: '定时任务已删除' });
});

cloudAdminRouter.post('/tasks/:id/run', async (c) => {
  const task = await c.env.DB.prepare('SELECT * FROM scheduled_task WHERE task_id = ?').bind(Number(c.req.param('id'))).first<any>();
  if (!task) return c.json({ code: 404, msg: '任务不存在' }, 404);
  const result = await executeTask(c.env, task);
  return c.json({ code: result.success ? 0 : 500, msg: result.message, data: result });
});

cloudAdminRouter.get('/tasks/logs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM scheduled_task_log ORDER BY task_log_id DESC LIMIT 100').all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.get('/transfer/:model', async (c) => {
  const model = MODELS[c.req.param('model')];
  if (!model) return c.json({ code: 404, msg: '不支持该内容模型' }, 404);
  const limit = Math.min(5000, Math.max(1, parseInt(c.req.query('limit') || '1000', 10) || 1000));
  const rows = await c.env.DB.prepare(`SELECT * FROM ${model.table} ORDER BY ${model.id} DESC LIMIT ?`).bind(limit).all();
  return c.json({ code: 0, data: { model: c.req.param('model'), exported_at: new Date().toISOString(), rows: rows.results || [] } }, 200, {
    'Content-Disposition': `attachment; filename="maccms-${c.req.param('model')}-export.json"`,
  });
});

cloudAdminRouter.post('/transfer/:model', async (c) => {
  const modelName = c.req.param('model');
  const model = MODELS[modelName];
  if (!model) return c.json({ code: 404, msg: '不支持该内容模型' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
  if (!rows.length) return c.json({ code: 400, msg: '导入文件中没有 rows 数据' }, 400);
  const columns = await c.env.DB.prepare(`PRAGMA table_info(${model.table})`).all<{ name: string }>();
  const allowed = new Set((columns.results || []).map((column) => column.name));
  let imported = 0;
  for (let start = 0; start < rows.length; start += 50) {
    const statements = [];
    for (const row of rows.slice(start, start + 50)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const keys = Object.keys(row).filter((key) => allowed.has(key));
      if (!keys.length) continue;
      statements.push(c.env.DB.prepare(`INSERT OR REPLACE INTO ${model.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .bind(...keys.map((key) => row[key] == null ? '' : row[key])));
    }
    if (statements.length) { await c.env.DB.batch(statements); imported += statements.length; }
  }
  return c.json({ code: 0, msg: `导入完成，处理 ${imported} 条；单次上限 500 条`, data: { imported } });
});

async function executeTask(env: Bindings, task: any): Promise<{ success: boolean; message: string; duration_ms: number }> {
  const started = Date.now();
  let success = true;
  let message = '任务完成';
  try {
    if (task.task_type === 'collect_node') {
      const node = await env.DB.prepare('SELECT * FROM collect_node WHERE id = ? AND status = 1').bind(task.node_id).first<CollectNodeItem>();
      if (!node) throw new Error('采集节点不存在或已停用');
      const result = await CollectorService.runCollectTask(env.DB, node, node.cron_hours || 24, 1);
      message = `采集完成：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}`;
    } else if (task.task_type === 'cleanup_logs') {
      const threshold = Math.floor(Date.now() / 1000) - 90 * 86400;
      await env.DB.batch([
        env.DB.prepare('DELETE FROM admin_audit_log WHERE created_at < ?').bind(threshold),
        env.DB.prepare('DELETE FROM collect_run_log WHERE created_at < ?').bind(threshold),
        env.DB.prepare('DELETE FROM traffic_event WHERE created_at < ?').bind(threshold),
        env.DB.prepare('DELETE FROM scheduled_task_log WHERE created_at < ?').bind(threshold),
      ]);
      message = '已清理 90 天前的操作、采集、访问和任务日志';
    } else if (task.task_type === 'reset_hits') {
      await env.DB.batch([
        env.DB.prepare('UPDATE vod SET vod_hits_day = 0'), env.DB.prepare('UPDATE art SET art_hits_day = 0'),
        env.DB.prepare('UPDATE topic SET topic_hits_day = 0'),
      ]);
      message = '影片、文章和专题的日访问计数已归零';
    } else {
      throw new Error('未知任务类型');
    }
  } catch (error) {
    success = false;
    message = (error as Error).message.slice(0, 1000);
  }
  const duration = Date.now() - started;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`UPDATE scheduled_task SET last_run_at=?,last_status=?,last_message=?,next_run_at=? WHERE task_id=?`)
      .bind(now, success ? 'success' : 'failed', message, now + Math.max(5, Number(task.interval_minutes) || 60) * 60, task.task_id),
    env.DB.prepare(`INSERT INTO scheduled_task_log (task_id,task_name,success,message,duration_ms,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(task.task_id, task.task_name, success ? 1 : 0, message, duration, now),
  ]);
  return { success, message, duration_ms: duration };
}

export async function runDueCloudTasks(env: Bindings): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const due = await env.DB.prepare('SELECT * FROM scheduled_task WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at LIMIT 10')
    .bind(now).all<any>();
  for (const task of due.results || []) await executeTask(env, task);
}
