// ========================================================
// 后台管理 API 路由 (全量对齐 MacCMS 10 & 8 管理体系)
// 包含批量运维、重名合并、字符替换、会员卡密、明星角色、报错受理等
// ========================================================

import { Hono } from 'hono';
import type { Bindings, CollectNodeItem, TypeBindItem, TypeItem, VodItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { VodService } from '../services/vod.ts';
import { CollectorService } from '../services/collector.ts';
import { DEFAULT_THEME, ThemeService } from '../services/theme.ts';
import { UserService } from '../services/user.ts';
import { CardService } from '../services/card.ts';
import { ActorService } from '../services/actor.ts';
import { GbookService } from '../services/gbook.ts';
import { AdsService } from '../services/ads.ts';
import { WebsiteService } from '../services/website.ts';
import { MangaService } from '../services/manga.ts';
import { PaymentService } from '../services/payment.ts';
import { MemberSecurityService } from '../services/member-security.ts';
import { cloudAdminRouter } from './cloud-admin.ts';

export const adminRouter = new Hono<{ Bindings: Bindings }>();

const readIds = (value: unknown): number[] => Array.isArray(value)
  ? Array.from(new Set(value.map((id) => parseInt(String(id), 10)).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 500)
  : [];

const BACKUP_TABLES = [
  'type', 'vod', 'art', 'topic', 'manga', 'actor', 'role', 'website', 'user',
  'user_group', 'card', 'order', 'ulog', 'gbook', 'comment', 'link', 'ads',
  'collect_node', 'type_bind', 'player', 'downer', 'server', 'config',
  'theme_config', 'site_host_config', 'site_page', 'cj_history', 'live_category', 'live_channel', 'collect_run_log', 'user_login_log',
  'admin_role', 'admin_account', 'user_follow', 'danmaku', 'chatroom_message', 'user_pm', 'share_log',
  'cash_log', 'coupon', 'user_coupon', 'mall_goods', 'mall_order', 'site_notice', 'sign_log', 'vod_play_fail',
  'content_check_rule', 'content_check_issue', 'scheduled_task', 'scheduled_task_log', 'media_asset', 'media_sync_scan', 'media_sync_item', 'telegram_storage_account', 'telegram_storage_state', 'user_invite_code', 'user_invite_reward', 'user_access_rule', 'recycle_bin',
  'sign_milestone', 'user_sign_milestone',
  'seckill_campaign',
  'user_notification', 'web_push_subscription', 'payment_intent', 'payment_event', 'user_post', 'user_post_like', 'cash_withdrawal', 'user_wallet',
  'search_query_log', 'resource_check_item', 'content_translation', 'role_vote', 'role_score_vote',
  'user_post_comment', 'user_post_report', 'user_post_attachment', 'playback_trial_session',
] as const;
type BackupTable = typeof BACKUP_TABLES[number];
const isBackupTable = (value: string): value is BackupTable =>
  (BACKUP_TABLES as readonly string[]).includes(value);

const CONTENT_TABLES: Record<string, { table: string; id: string }> = {
  vod: { table: 'vod', id: 'vod_id' }, art: { table: 'art', id: 'art_id' }, topic: { table: 'topic', id: 'topic_id' },
  manga: { table: 'manga', id: 'manga_id' }, actor: { table: 'actor', id: 'actor_id' }, role: { table: 'role', id: 'role_id' },
  website: { table: 'website', id: 'website_id' },
};

async function archiveContent(db: D1Database, model: string, ids: number[]): Promise<void> {
  const mapping = CONTENT_TABLES[model];
  if (!mapping || !ids.length) return;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batchIds = ids.slice(offset, offset + 100);
    const rows = await db.prepare(`SELECT * FROM ${mapping.table} WHERE ${mapping.id} IN (${batchIds.map(() => '?').join(',')})`)
      .bind(...batchIds).all<Record<string, unknown>>();
    if (!rows.results?.length) continue;
    const statements = rows.results.map((row) => db.prepare(`INSERT INTO recycle_bin (model,record_id,record_json,deleted_by,deleted_at)
      VALUES (?,?,?,?,?)`).bind(model, Number(row[mapping.id]), JSON.stringify(row), 'admin', Math.floor(Date.now() / 1000)));
    await db.batch(statements);
  }
}

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
  const account = await c.env.DB.prepare(`SELECT a.username, a.password_hash, a.role_key, a.status,
      r.role_name, r.permissions
    FROM admin_account a LEFT JOIN admin_role r ON r.role_key = a.role_key
    WHERE a.username = ? LIMIT 1`).bind(username).first<any>();

  let isValid = false;
  const inputHash = await AuthUtils.sha256(password);

  if (account) {
    isValid = Number(account.status) === 1 && inputHash === account.password_hash;
  } else if (envPassword) {
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

  if (account) {
    await c.env.DB.prepare('UPDATE admin_account SET last_login_at = ?, updated_at = ? WHERE username = ?')
      .bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), username).run();
  }

  const secret = getAdminSecret(c, dbHash);
  const token = await AuthUtils.generateToken(username, secret, 7);
  let permissions: string[] = ['*'];
  let role = '超级管理员';
  if (account) {
    try { const parsed = JSON.parse(account.permissions || '[]'); permissions = Array.isArray(parsed) ? parsed : []; } catch { permissions = []; }
    role = account.role_name || account.role_key;
  }
  return c.json({
    code: 0,
    msg: '登录成功',
    data: {
      token,
      username,
      role,
      permissions,
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

  let permissions: string[] = ['*'];
  if (check.username) {
    const account = await c.env.DB.prepare(`SELECT a.status, r.permissions FROM admin_account a
      LEFT JOIN admin_role r ON r.role_key = a.role_key WHERE a.username = ? LIMIT 1`)
      .bind(check.username).first<{ status: number; permissions: string | null }>();
    if (account) {
      if (Number(account.status) !== 1) return c.json({ code: 401, msg: '管理员账号已停用' }, 401);
      try { const parsed = JSON.parse(account.permissions || '[]'); permissions = Array.isArray(parsed) ? parsed : []; } catch { permissions = []; }
    } else if (check.username !== (configs.admin_user || 'admin')) {
      return c.json({ code: 401, msg: '管理员账号已删除' }, 401);
    }
  }
  const path = new URL(c.req.url).pathname.replace(/^\/api\/admin/, '');
  const cloudResource = path.match(/^\/cloud\/data\/([^/]+)/)?.[1] || '';
  const permission = path === '/overview'
    ? ''
      : path.startsWith('/cloud/access-rules') || path.startsWith('/cloud/sign-milestones')
      ? 'users'
      : path.startsWith('/cloud/recycle')
        ? 'content'
        : path.startsWith('/cloud/cash') || path.startsWith('/cloud/orders') || path.startsWith('/cloud/seckill') || path.startsWith('/cloud/notifications') || path.startsWith('/cloud/withdrawals') || path.startsWith('/cloud/posts')
          ? 'ops'
    : path.startsWith('/cloud/transfer')
      ? 'content'
      : path.startsWith('/cloud/data/')
        ? (cloudResource === 'messages' || cloudResource === 'signs' ? 'users' : 'ops')
        : path.startsWith('/collect') || path.startsWith('/player') || path.startsWith('/downer') || path.startsWith('/server')
    ? 'collect'
    : path.startsWith('/user') || path.startsWith('/group') || path.startsWith('/card') || path.startsWith('/order')
      ? 'users'
      : path.startsWith('/gbook') || path.startsWith('/comment') || path.startsWith('/ads') || path.startsWith('/link') || path.startsWith('/live') || path.startsWith('/urlsend')
        ? 'ops'
        : path.startsWith('/vod') || path.startsWith('/art') || path.startsWith('/topic') || path.startsWith('/type') || path.startsWith('/actor') || path.startsWith('/role') || path.startsWith('/website') || path.startsWith('/manga') || path.startsWith('/tools')
          ? 'content'
          : 'system';
  if (permission && !permissions.includes('*') && !permissions.includes(permission)) {
    return c.json({ code: 403, msg: '当前管理员没有该模块的操作权限' }, 403);
  }

  await next();
  if (check.username && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method.toUpperCase())) {
    try {
      await c.env.DB.prepare(`
        INSERT INTO admin_audit_log (admin_name, method, path, response_status, client_ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        check.username,
        c.req.method.toUpperCase(),
        new URL(c.req.url).pathname.slice(0, 240),
        c.res.status,
        (c.req.header('CF-Connecting-IP') || '').slice(0, 64),
        Math.floor(Date.now() / 1000),
      ).run();
    } catch (err) {
      console.error('Failed to write admin audit log:', err);
    }
  }
});

adminRouter.post('/payment/reconcile/:orderCode', async (c) => {
  try {
    const result = await PaymentService.reconcile(c.env, c.req.param('orderCode'), new URL(c.req.url).origin);
    return c.json({ code: 0, msg: `查询完成：${result.status}`, data: result });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '支付对账失败' }, 400);
  }
});

adminRouter.post('/payment/refund/:orderCode', async (c) => {
  try {
    const result = await PaymentService.refundMallOrder(c.env, c.req.param('orderCode'));
    return c.json({ code: 0, msg: '易支付退款已受理，商城库存、积分和优惠券已按退款流程返还', data: result });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '支付退款失败' }, 400);
  }
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
    countWebsite,
    countManga,
    countLive,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM vod').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM type').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM collect_node').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM art').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM topic').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM actor').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM user').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM gbook WHERE gbook_status = 0').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM website').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM manga WHERE manga_recycle_time = 0').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM live_channel').first<{ c: number }>(),
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
      total_website: countWebsite?.c || 0,
      total_manga: countManga?.c || 0,
      total_live: countLive?.c || 0,
      today_updated: countToday?.c || 0,
    },
  });
});

// 操作审计、内容访问分析与 Cloudflare D1 数据维护
adminRouter.get('/audit/list', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(q.limit || '30', 10) || 30));
  const keyword = (q.wd || '').trim();
  const where = keyword ? 'WHERE admin_name LIKE ? OR path LIKE ? OR method LIKE ?' : '';
  const values = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM admin_audit_log ${where}`)
    .bind(...values).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`
    SELECT * FROM admin_audit_log ${where}
    ORDER BY audit_id DESC LIMIT ? OFFSET ?
  `).bind(...values, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

adminRouter.get('/analytics', async (c) => {
  const days = Math.min(90, Math.max(7, parseInt(c.req.query('days') || '30', 10) || 30));
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const [trend, byModel, top] = await Promise.all([
    c.env.DB.prepare(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM traffic_event WHERE day >= ? GROUP BY day ORDER BY day ASC`).bind(from).all(),
    c.env.DB.prepare(`SELECT model, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM traffic_event WHERE day >= ? GROUP BY model ORDER BY views DESC`).bind(from).all(),
    c.env.DB.prepare(`SELECT model, content_id, COUNT(*) AS views,
      MAX(created_at) AS last_view FROM traffic_event WHERE day >= ?
      GROUP BY model, content_id ORDER BY views DESC LIMIT 10`).bind(from).all(),
  ]);
  const [vod, art, manga, users, pending] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM vod').first<{ c: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM art').first<{ c: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM manga WHERE manga_status=1').first<{ c: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM user').first<{ c: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM gbook WHERE gbook_status = 1').first<{ c: number }>(),
  ]);
  const totals = await c.env.DB.prepare(`SELECT COUNT(*) AS views,
    COUNT(DISTINCT visitor_hash) AS visitors FROM traffic_event WHERE day >= ?`).bind(from)
    .first<{ views: number; visitors: number }>();
  return c.json({ code: 0, data: {
    days, from, views: totals?.views || 0, visitors: totals?.visitors || 0,
    content: { vod: vod?.c || 0, art: art?.c || 0, manga: manga?.c || 0 }, members: users?.c || 0,
    public_gbook: pending?.c || 0,
    trend: trend.results || [], by_model: byModel.results || [], top: top.results || [],
  } });
});

adminRouter.get('/database/tables', async (c) => {
  const tables = await Promise.all(BACKUP_TABLES.map(async (table) => {
    const row = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).first<{ c: number }>();
    return { name: table, rows: row?.c || 0 };
  }));
  return c.json({ code: 0, data: tables });
});

adminRouter.get('/database/export/:table', async (c) => {
  const table = c.req.param('table');
  if (!isBackupTable(table)) return c.json({ code: 400, msg: '不支持备份该数据表' }, 400);
  const rows = await c.env.DB.prepare(`SELECT * FROM "${table}" LIMIT 10000`).all<Record<string, unknown>>();
  return c.json({ code: 0, data: { table, exported_at: new Date().toISOString(), rows: rows.results || [], truncated: (rows.results || []).length === 10000 } });
});

adminRouter.post('/database/import/:table', async (c) => {
  const table = c.req.param('table');
  if (!isBackupTable(table)) return c.json({ code: 400, msg: '不支持还原该数据表' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > 500) return c.json({ code: 400, msg: '单次还原必须包含 1 到 500 行数据' }, 400);
  const info = await c.env.DB.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
  const columns = new Set((info.results || []).map((col) => col.name));
  const statements = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return c.json({ code: 400, msg: '备份行格式无效' }, 400);
    const keys = Object.keys(row as Record<string, unknown>);
    if (!keys.length || keys.some((key) => !columns.has(key))) return c.json({ code: 400, msg: '备份包含当前数据表不存在的字段' }, 400);
    const quoted = keys.map((key) => `"${key}"`).join(', ');
    const marks = keys.map(() => '?').join(', ');
    const values = keys.map((key) => {
      const value = (row as Record<string, unknown>)[key];
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    });
    statements.push(c.env.DB.prepare(`INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${marks})`).bind(...values));
  }
  let restored = 0;
  for (let i = 0; i < statements.length; i += 50) {
    await c.env.DB.batch(statements.slice(i, i + 50));
    restored += Math.min(50, statements.length - i);
  }
  return c.json({ code: 0, msg: `已还原 ${restored} 行`, data: { restored } });
});

adminRouter.get('/database/r2/backups', async (c) => {
  if (!c.env.MEDIA_BUCKET) return c.json({ code: 503, msg: '未绑定 R2 媒体存储桶' }, 503);
  const listed = await c.env.MEDIA_BUCKET.list({ prefix: 'maccms-db-backups/', limit: 100 });
  return c.json({ code: 0, data: (listed.objects || []).map((item) => ({ key: item.key, size: item.size, uploaded: item.uploaded?.toISOString?.() || '' })) });
});

adminRouter.post('/database/r2/backups/:table', async (c) => {
  const table = c.req.param('table');
  if (!isBackupTable(table)) return c.json({ code: 400, msg: '不支持备份该数据表' }, 400);
  if (!c.env.MEDIA_BUCKET) return c.json({ code: 503, msg: '未绑定 R2 媒体存储桶' }, 503);
  const rows = await c.env.DB.prepare(`SELECT * FROM "${table}" LIMIT 10001`).all<Record<string, unknown>>();
  if ((rows.results || []).length > 10000) return c.json({ code: 413, msg: '该表超过单个 R2 快照 10,000 行上限，请使用分页 JSON 备份' }, 413);
  const exportedAt = new Date().toISOString();
  const payload = JSON.stringify({ table, exported_at: exportedAt, rows: rows.results || [] });
  const compressed = await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const stamp = exportedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const key = `maccms-db-backups/${table}/${stamp}-${crypto.randomUUID().slice(0, 8)}.json.gz`;
  await c.env.MEDIA_BUCKET.put(key, compressed, { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' }, customMetadata: { table, rowCount: String((rows.results || []).length) } });
  return c.json({ code: 0, msg: `已将 ${(rows.results || []).length} 行压缩备份到 R2`, data: { key, rows: (rows.results || []).length, bytes: compressed.byteLength } });
});

adminRouter.post('/database/r2/restore', async (c) => {
  if (!c.env.MEDIA_BUCKET) return c.json({ code: 503, msg: '未绑定 R2 媒体存储桶' }, 503);
  const body = await c.req.json().catch(() => ({}));
  const table = String(body.table || ''), key = String(body.key || '');
  if (!isBackupTable(table) || !key.startsWith(`maccms-db-backups/${table}/`) || !key.endsWith('.json.gz') || key.includes('..')) {
    return c.json({ code: 400, msg: '备份键或数据表不匹配' }, 400);
  }
  const object = await c.env.MEDIA_BUCKET.get(key);
  if (!object) return c.json({ code: 404, msg: 'R2 快照不存在' }, 404);
  let payload: { table?: string; rows?: unknown[] };
  try { payload = JSON.parse(await new Response(object.body.pipeThrough(new DecompressionStream('gzip'))).text()); }
  catch { return c.json({ code: 400, msg: 'R2 快照解压或 JSON 解析失败' }, 400); }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (payload.table !== table || rows.length > 10000) return c.json({ code: 400, msg: '快照内容与所选数据表不匹配或超过行数上限' }, 400);
  const info = await c.env.DB.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
  const columns = new Set((info.results || []).map((col) => col.name));
  let restored = 0;
  for (let offset = 0; offset < rows.length; offset += 50) {
    const statements = [];
    for (const row of rows.slice(offset, offset + 50)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return c.json({ code: 400, msg: '快照行格式无效' }, 400);
      const keys = Object.keys(row as Record<string, unknown>);
      if (!keys.length || keys.some((column) => !columns.has(column))) return c.json({ code: 400, msg: '快照包含当前表不存在的字段' }, 400);
      statements.push(c.env.DB.prepare(`INSERT OR REPLACE INTO "${table}" (${keys.map((column) => `"${column}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .bind(...keys.map((column) => { const value = (row as Record<string, unknown>)[column]; return value !== null && typeof value === 'object' ? JSON.stringify(value) : value; })));
    }
    await c.env.DB.batch(statements);
    restored += statements.length;
  }
  return c.json({ code: 0, msg: `已从 R2 还原 ${restored} 行`, data: { restored } });
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
  await archiveContent(c.env.DB, 'vod', [id]);
  await VodService.deleteVod(c.env.DB, id);
  return c.json({ code: 0, msg: '已移至回收站' });
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
  const ids = readIds(body.ids);
  await archiveContent(c.env.DB, 'vod', ids);
  const count = await VodService.batchDeleteVods(c.env.DB, body.ids || []);
  return c.json({ code: 0, msg: `${count} 条记录已移至回收站` });
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

adminRouter.get('/collect/logs', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(q.limit || '20', 10) || 20));
  const nodeId = parseInt(q.node_id || '0', 10) || 0;
  const where = nodeId > 0 ? 'WHERE node_id = ?' : '';
  const params = nodeId > 0 ? [nodeId] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM collect_run_log ${where}`).bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT * FROM collect_run_log ${where} ORDER BY run_id DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
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
  const status = q.status !== undefined ? parseInt(q.status, 10) : -1;
  const data = await VodService.queryArts(c.env.DB, { page, limit, wd: q.wd, status });
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
  await archiveContent(c.env.DB, 'art', [id]);
  await VodService.deleteArt(c.env.DB, id);
  return c.json({ code: 0, msg: '文章已移至回收站' });
});

adminRouter.post('/art/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要更新的文章' }, 400);
  const status = Number(body.status) === 1 ? 1 : 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE art SET art_status = ? WHERE art_id IN (${placeholders})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已更新 ${result.meta.changes || 0} 篇文章` });
});

adminRouter.post('/art/batch/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要删除的文章' }, 400);
  const placeholders = ids.map(() => '?').join(',');
  await archiveContent(c.env.DB, 'art', ids);
  const result = await c.env.DB.prepare(`DELETE FROM art WHERE art_id IN (${placeholders})`).bind(...ids).run();
  return c.json({ code: 0, msg: `${result.meta.changes || 0} 篇文章已移至回收站` });
});

// 9. 影视专题管理 API
adminRouter.get('/topic/list', async (c) => {
  const data = await VodService.queryTopics(c.env.DB, true);
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
  await archiveContent(c.env.DB, 'topic', [id]);
  await VodService.deleteTopic(c.env.DB, id);
  return c.json({ code: 0, msg: '专题已移至回收站' });
});

adminRouter.post('/topic/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要更新的专题' }, 400);
  const status = Number(body.status) === 1 ? 1 : 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE topic SET topic_status = ? WHERE topic_id IN (${placeholders})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已更新 ${result.meta.changes || 0} 个专题` });
});

adminRouter.post('/topic/batch/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要删除的专题' }, 400);
  const placeholders = ids.map(() => '?').join(',');
  await archiveContent(c.env.DB, 'topic', ids);
  const result = await c.env.DB.prepare(`DELETE FROM topic WHERE topic_id IN (${placeholders})`).bind(...ids).run();
  return c.json({ code: 0, msg: `${result.meta.changes || 0} 个专题已移至回收站` });
});

// 10. MacCMS v10 漫画管理 API
adminRouter.get('/manga/list', async (c) => {
  const q = c.req.query();
  const status = q.status !== undefined ? parseInt(q.status, 10) : -1;
  const data = await MangaService.query(c.env.DB, {
    page: parseInt(q.page || '1', 10),
    limit: parseInt(q.limit || '20', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined,
    wd: q.wd,
    status,
  });
  return c.json({ code: 0, data });
});

adminRouter.get('/manga/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const data = await MangaService.get(c.env.DB, id);
  if (!data) return c.json({ code: 404, msg: '漫画不存在' }, 404);
  return c.json({ code: 0, data });
});

adminRouter.post('/manga/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const id = await MangaService.save(c.env.DB, body);
    return c.json({ code: 0, msg: '漫画已保存', data: { manga_id: id } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

adminRouter.delete('/manga/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的漫画 ID' }, 400);
  await archiveContent(c.env.DB, 'manga', [id]);
  await MangaService.delete(c.env.DB, id);
  return c.json({ code: 0, msg: '漫画已移至回收站' });
});

adminRouter.post('/manga/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要更新的漫画' }, 400);
  const status = Number(body.status) === 1 ? 1 : 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE manga SET manga_status = ? WHERE manga_id IN (${placeholders})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已更新 ${result.meta.changes || 0} 部漫画` });
});

adminRouter.post('/manga/batch/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择要删除的漫画' }, 400);
  const placeholders = ids.map(() => '?').join(',');
  await archiveContent(c.env.DB, 'manga', ids);
  const result = await c.env.DB.prepare(`DELETE FROM manga WHERE manga_id IN (${placeholders})`).bind(...ids).run();
  return c.json({ code: 0, msg: `${result.meta.changes || 0} 部漫画已移至回收站` });
});

// 11. 明星与角色管理 API
adminRouter.get('/actor/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await ActorService.queryActors(c.env.DB, { page, limit, wd: q.wd, includeHidden: true });
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
  await archiveContent(c.env.DB, 'actor', [id]);
  await ActorService.deleteActor(c.env.DB, id);
  return c.json({ code: 0, msg: '明星已移至回收站' });
});

adminRouter.get('/role/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await ActorService.queryRoles(c.env.DB, { page, limit, wd: q.wd, includeHidden: true });
  return c.json({ code: 0, data });
});

adminRouter.post('/role/save', async (c) => {
  const body = await c.req.json();
  const id = await ActorService.saveRole(c.env.DB, body);
  return c.json({ code: 0, msg: '角色信息已保存', data: { role_id: id } });
});

adminRouter.delete('/role/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await archiveContent(c.env.DB, 'role', [id]);
  await ActorService.deleteRole(c.env.DB, id);
  return c.json({ code: 0, msg: '角色已移至回收站' });
});

// 11. 会员中心管理 API
adminRouter.get('/user/list', async (c) => {
  const q = c.req.query();
  const page = parseInt(q.page || '1', 10);
  const limit = parseInt(q.limit || '15', 10);
  const data = await UserService.queryUsers(c.env.DB, { page, limit, wd: q.wd });
  return c.json({ code: 0, data });
});

adminRouter.get('/user/access-log', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(q.limit || '30', 10) || 30));
  const keyword = (q.wd || '').trim();
  const where = keyword ? 'WHERE l.user_name LIKE ? OR l.client_ip LIKE ?' : '';
  const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM user_login_log l ${where}`).bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT l.*, u.user_nick FROM user_login_log l
    LEFT JOIN user u ON u.user_id = l.user_id ${where}
    ORDER BY l.login_log_id DESC LIMIT ? OFFSET ?`).bind(...params, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

adminRouter.get('/user/ulog/list', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(q.limit || '30', 10) || 30));
  const keyword = (q.wd || '').trim();
  const where = keyword ? 'WHERE u.user_name LIKE ? OR ulog.ulog_rid = ?' : '';
  const params = keyword ? [`%${keyword}%`, Number(keyword) || -1] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM ulog LEFT JOIN user u ON u.user_id = ulog.user_id ${where}`)
    .bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT ulog.*, u.user_name, u.user_nick
    FROM ulog LEFT JOIN user u ON u.user_id = ulog.user_id ${where}
    ORDER BY ulog.ulog_id DESC LIMIT ? OFFSET ?`).bind(...params, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

adminRouter.post('/user/save', async (c) => {
  const body = await c.req.json();
  const id = await UserService.saveUser(c.env.DB, body);
  return c.json({ code: 0, msg: '会员信息已更新', data: { user_id: id } });
});

adminRouter.get('/order/list', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20', 10) || 20));
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (q.status !== undefined && q.status !== '') {
    conditions.push('o.order_status = ?');
    params.push(parseInt(q.status, 10) === 1 ? 1 : 0);
  }
  const keyword = String(q.wd || '').trim();
  if (keyword) {
    conditions.push('(o.order_code LIKE ? OR u.user_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM "order" o LEFT JOIN user u ON u.user_id = o.user_id ${where}`)
    .bind(...params).first<{ c: number }>();
  const count = total?.c || 0;
  const rows = await c.env.DB.prepare(`
    SELECT o.*, u.user_name
    FROM "order" o LEFT JOIN user u ON u.user_id = o.user_id
    ${where}
    ORDER BY o.order_time DESC, o.order_id DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, (page - 1) * limit).all();
  return c.json({ code: 0, data: { list: rows.results || [], total: count, page, limit, pagecount: Math.ceil(count / limit) } });
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

adminRouter.post('/gbook/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  const status = Number(body.status);
  if (!ids.length || (status !== 0 && status !== 1)) {
    return c.json({ code: 400, msg: '请选择留言并指定有效状态' }, 400);
  }
  const placeholders = ids.map(() => '?').join(',');
  await c.env.DB.prepare(`UPDATE gbook SET gbook_status = ? WHERE gbook_id IN (${placeholders})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已${status ? '公开' : '隐藏'} ${ids.length} 条反馈` });
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
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20', 10) || 20));
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (q.status === '0' || q.status === '1') {
    conditions.push('comment_status = ?');
    params.push(parseInt(q.status, 10));
  }
  if (q.mid && Number.isInteger(parseInt(q.mid, 10))) {
    conditions.push('comment_mid = ?');
    params.push(parseInt(q.mid, 10));
  }
  const keyword = String(q.wd || '').trim();
  if (keyword) {
    conditions.push('(comment_name LIKE ? OR comment_content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM comment ${where}`)
    .bind(...params).first<{ c: number }>();
  const total = count?.c || 0;
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
    ${where}
    ORDER BY c.comment_id DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, (page - 1) * limit).all();
  return c.json({ code: 0, data: { list: rows.results || [], total, page, limit, pagecount: Math.ceil(total / limit) } });
});

adminRouter.post('/comment/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  const status = Number(body.status);
  if (!ids.length || (status !== 0 && status !== 1)) {
    return c.json({ code: 400, msg: '请选择评论并指定有效状态' }, 400);
  }
  const placeholders = ids.map(() => '?').join(',');
  await c.env.DB.prepare(`UPDATE comment SET comment_status = ? WHERE comment_id IN (${placeholders})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已${status ? '通过' : '隐藏'} ${ids.length} 条评论` });
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

// 16.1 MacCMS 网址导航内容模型 (type_mid=11)
adminRouter.get('/website/list', async (c) => {
  const q = c.req.query();
  const status = q.status !== undefined ? parseInt(q.status, 10) : undefined;
  const data = await WebsiteService.query(c.env.DB, {
    page: parseInt(q.page || '1', 10),
    limit: parseInt(q.limit || '20', 10),
    typeId: q.type_id ? parseInt(q.type_id, 10) : undefined,
    wd: q.wd,
    status,
  });
  return c.json({ code: 0, data });
});

adminRouter.post('/website/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const id = await WebsiteService.save(c.env.DB, body);
    return c.json({ code: 0, msg: '网址已保存', data: { website_id: id } });
  } catch (err) {
    return c.json({ code: 400, msg: (err as Error).message }, 400);
  }
});

adminRouter.delete('/website/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的网址 ID' }, 400);
  await archiveContent(c.env.DB, 'website', [id]);
  await WebsiteService.delete(c.env.DB, id);
  return c.json({ code: 0, msg: '网址已移至回收站' });
});

adminRouter.post('/website/batch/status', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择网址条目' }, 400);
  const status = Number(body.status) === 1 ? 1 : 0;
  const marks = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE website SET website_status = ? WHERE website_id IN (${marks})`)
    .bind(status, ...ids).run();
  return c.json({ code: 0, msg: `已更新 ${result.meta.changes || 0} 个网址状态` });
});

adminRouter.post('/website/batch/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = readIds(body.ids);
  if (!ids.length) return c.json({ code: 400, msg: '请选择网址条目' }, 400);
  const marks = ids.map(() => '?').join(',');
  await archiveContent(c.env.DB, 'website', ids);
  const result = await c.env.DB.prepare(`DELETE FROM website WHERE website_id IN (${marks})`).bind(...ids).run();
  return c.json({ code: 0, msg: `${result.meta.changes || 0} 个网址条目已移至回收站` });
});

// 18. MacCMS10 直播频道与分类维护
adminRouter.get('/live/categories', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM live_category ORDER BY live_category_sort, live_category_id').all();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/live/category/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.live_category_name || '').trim();
  if (!name) return c.json({ code: 400, msg: '请填写直播分类名称' }, 400);
  const status = Number(body.live_category_status) === 0 ? 0 : 1;
  const sort = Number(body.live_category_sort) || 0;
  const id = Number(body.live_category_id) || 0;
  if (id > 0) {
    await c.env.DB.prepare('UPDATE live_category SET live_category_name = ?, live_category_sort = ?, live_category_status = ? WHERE live_category_id = ?')
      .bind(name, sort, status, id).run();
  } else {
    await c.env.DB.prepare('INSERT INTO live_category (live_category_name, live_category_sort, live_category_status) VALUES (?, ?, ?)')
      .bind(name, sort, status).run();
  }
  return c.json({ code: 0, msg: '直播分类已保存' });
});

adminRouter.delete('/live/category/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的分类 ID' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE live_channel SET live_category_id = 0 WHERE live_category_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM live_category WHERE live_category_id = ?').bind(id),
  ]);
  return c.json({ code: 0, msg: '直播分类已删除，频道已移至未分类' });
});

adminRouter.get('/live/list', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(q.limit || '20', 10) || 20));
  const keyword = (q.wd || '').trim();
  const category = parseInt(q.category_id || '0', 10) || 0;
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (keyword) { where.push('(l.live_name LIKE ? OR l.live_url LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (category > 0) { where.push('l.live_category_id = ?'); params.push(category); }
  if (q.status !== undefined && q.status !== '') { where.push('l.live_status = ?'); params.push(Number(q.status) === 1 ? 1 : 0); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM live_channel l ${clause}`).bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT l.*, c.live_category_name FROM live_channel l
    LEFT JOIN live_category c ON c.live_category_id = l.live_category_id ${clause}
    ORDER BY l.live_sort, l.live_id DESC LIMIT ? OFFSET ?`)
    .bind(...params, limit, (page - 1) * limit).all();
  const count = total?.c || 0;
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [] } });
});

adminRouter.post('/live/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.live_name || '').trim();
  const url = String(body.live_url || '').trim();
  if (!name || !url || !/^https?:\/\//i.test(url)) return c.json({ code: 400, msg: '请填写频道名称和有效的 HTTP(S) 播放地址' }, 400);
  const fields = [
    Math.max(0, Number(body.live_category_id) || 0), name, url,
    String(body.live_logo || '').trim(), String(body.live_desc || '').trim(),
    Number(body.live_status) === 0 ? 0 : 1, Number(body.live_sort) || 0,
    Math.floor(Date.now() / 1000),
  ];
  const id = Number(body.live_id) || 0;
  if (id > 0) {
    await c.env.DB.prepare(`UPDATE live_channel SET live_category_id = ?, live_name = ?, live_url = ?, live_logo = ?, live_desc = ?, live_status = ?, live_sort = ?, live_time = ? WHERE live_id = ?`)
      .bind(...fields, id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO live_channel (live_category_id, live_name, live_url, live_logo, live_desc, live_status, live_sort, live_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(...fields).run();
  }
  return c.json({ code: 0, msg: '直播频道已保存' });
});

adminRouter.delete('/live/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '无效的频道 ID' }, 400);
  await c.env.DB.prepare('DELETE FROM live_channel WHERE live_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '直播频道已删除' });
});

// 19. 百度主动推送：从已发布内容生成前台详情地址后推送
adminRouter.get('/urlsend/settings', async (c) => {
  const cfg = await VodService.getConfigs(c.env.DB);
  return c.json({ code: 0, data: { site_url: cfg.site_url || c.env.SITE_URL || '', has_token: !!cfg.urlsend_baidu_token } });
});

adminRouter.post('/urlsend/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  if (token.length > 300) return c.json({ code: 400, msg: '推送密钥长度无效' }, 400);
  if (body.clear === true) await VodService.setConfig(c.env.DB, 'urlsend_baidu_token', '');
  else if (token) await VodService.setConfig(c.env.DB, 'urlsend_baidu_token', token);
  return c.json({ code: 0, msg: '推送密钥已保存' });
});

adminRouter.post('/urlsend/push', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = String(body.model || 'vod');
  const limit = Math.min(1000, Math.max(1, parseInt(body.limit || '100', 10) || 100));
  const cfg = await VodService.getConfigs(c.env.DB);
  const token = String(cfg.urlsend_baidu_token || '').trim();
  const siteUrl = String(cfg.site_url || c.env.SITE_URL || '').trim();
  if (!token) return c.json({ code: 400, msg: '请先配置百度推送 Token' }, 400);
  let origin: URL;
  try { origin = new URL(siteUrl); } catch { return c.json({ code: 400, msg: '请先在系统设置中配置正确的站点网址' }, 400); }
  if (!['http:', 'https:'].includes(origin.protocol) || ['localhost', '127.0.0.1'].includes(origin.hostname)) {
    return c.json({ code: 400, msg: '站点网址必须是可公开访问的 HTTP(S) 地址' }, 400);
  }
  const modelSql: Record<string, { sql: string; column: string; path: string }> = {
    vod: { sql: 'SELECT vod_id AS id FROM vod WHERE vod_status = 1 ORDER BY vod_time DESC LIMIT ?', column: 'vod', path: '/detail.html?id=' },
    art: { sql: 'SELECT art_id AS id FROM art WHERE art_status = 1 ORDER BY art_time DESC LIMIT ?', column: 'art', path: '/art.html?id=' },
    topic: { sql: 'SELECT topic_id AS id FROM topic WHERE topic_status = 1 ORDER BY topic_time DESC LIMIT ?', column: 'topic', path: '/topic.html?id=' },
    actor: { sql: 'SELECT actor_id AS id FROM actor WHERE actor_status = 1 ORDER BY actor_time DESC LIMIT ?', column: 'actor', path: '/actor_detail.html?id=' },
    manga: { sql: 'SELECT manga_id AS id FROM manga WHERE manga_status = 1 ORDER BY manga_time DESC LIMIT ?', column: 'manga', path: '/manga.html?id=' },
  };
  const query = modelSql[model];
  if (!query) return c.json({ code: 400, msg: '当前仅支持影片、文章、专题、明星和漫画' }, 400);
  const rows = await c.env.DB.prepare(query.sql).bind(limit).all<{ id: number }>();
  const urls = (rows.results || []).map((row) => `${origin.origin}${query.path}${row.id}`);
  if (!urls.length) return c.json({ code: 400, msg: '没有可推送的已发布内容' }, 400);
  let responseText = '';
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetch(`https://data.zz.baidu.com/urls?site=${encodeURIComponent(origin.host)}&token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: urls.join('\n'),
    });
    status = response.status;
    responseText = (await response.text()).slice(0, 2000);
    try { payload = JSON.parse(responseText); } catch { payload = { message: responseText }; }
  } catch (err) {
    responseText = (err as Error).message.slice(0, 2000);
  }
  await c.env.DB.prepare(`INSERT INTO url_push_log (model, submitted, success, remain, status, response, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(model, urls.length, Number(payload.success) || 0, Number(payload.remain) || 0, status, responseText, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: status >= 200 && status < 300 ? 0 : 502, msg: status >= 200 && status < 300 ? '推送请求已提交' : '百度推送失败', data: { model, submitted: urls.length, status, result: payload } }, status >= 200 && status < 300 ? 200 : 502);
});

adminRouter.get('/urlsend/history', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM url_push_log ORDER BY push_id DESC LIMIT 50').all();
  return c.json({ code: 0, data: rows.results || [] });
});

// 20. 海螺主题全局配置 API (120+ 项参数可视化)
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

// D1-backed static pages are rendered as escaped HTML by the Worker edge route.
adminRouter.get('/pages', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT page_id,slug,title,description,keywords,body,status,created_at,updated_at
    FROM site_page ORDER BY updated_at DESC,page_id DESC LIMIT 500`).all();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/pages', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Math.max(0, Number(body.page_id) || 0);
  const slug = String(body.slug || '').trim().toLowerCase();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim().slice(0, 320);
  const keywords = String(body.keywords || '').trim().slice(0, 300);
  const content = String(body.body || '').trim();
  const status = Number(body.status) === 1 ? 1 : 0;
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(slug)) return c.json({ code: 400, msg: '页面路径须为 2–63 位小写字母、数字、短横线或下划线' }, 400);
  if (!title || title.length > 120 || content.length > 50000) return c.json({ code: 400, msg: '标题必填且不超过 120 字，页面正文不能超过 50,000 字' }, 400);
  const now = Math.floor(Date.now() / 1000);
  try {
    if (id) {
      const saved = await c.env.DB.prepare(`UPDATE site_page SET slug=?,title=?,description=?,keywords=?,body=?,status=?,updated_at=? WHERE page_id=?`)
        .bind(slug, title, description, keywords, content, status, now, id).run();
      if (!saved.meta.changes) return c.json({ code: 404, msg: '页面不存在' }, 404);
    } else {
      await c.env.DB.prepare(`INSERT INTO site_page(slug,title,description,keywords,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(slug, title, description, keywords, content, status, now, now).run();
    }
  } catch (error) {
    if ((error as Error).message.includes('UNIQUE')) return c.json({ code: 409, msg: '页面路径已被使用' }, 409);
    throw error;
  }
  return c.json({ code: 0, msg: status ? '页面已发布' : '页面草稿已保存' });
});

adminRouter.delete('/pages/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ code: 400, msg: '页面编号无效' }, 400);
  const result = await c.env.DB.prepare('DELETE FROM site_page WHERE page_id=?').bind(id).run();
  return c.json({ code: result.meta.changes ? 0 : 404, msg: result.meta.changes ? '页面已删除' : '页面不存在' }, result.meta.changes ? 200 : 404);
});

adminRouter.get('/sites', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM site_host_config ORDER BY hostname LIMIT 300').all();
  return c.json({ code: 0, data: rows.results || [] });
});

adminRouter.post('/sites', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const hostname = String(body.hostname || '').trim().toLowerCase();
  let hostUrl: URL;
  try { hostUrl = new URL(`https://${hostname}`); } catch { return c.json({ code: 400, msg: '域名格式无效' }, 400); }
  if (!hostname || hostUrl.hostname !== hostname || hostUrl.pathname !== '/' || hostname.length > 253 || hostname.includes(':')) return c.json({ code: 400, msg: '请填写不带端口、路径和协议的域名' }, 400);
  let siteUrl: URL;
  try { siteUrl = new URL(String(body.site_url || `https://${hostname}`).trim()); } catch { return c.json({ code: 400, msg: '站点 URL 格式无效' }, 400); }
  if (siteUrl.protocol !== 'https:' || siteUrl.hostname.toLowerCase() !== hostname || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash || !['', '/'].includes(siteUrl.pathname)) {
    return c.json({ code: 400, msg: '站点 URL 必须是此域名的 HTTPS 根地址' }, 400);
  }
  const parseTheme = (value: unknown): string | null => {
    let parsed: unknown;
    try { parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 180) return null;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.some(([key, item]) => !DEFAULT_THEME[key] || key === 'theme.script.custom' || !['string','number','boolean'].includes(typeof item) || String(item).length > 2000)) return null;
    return JSON.stringify(parsed);
  };
  const theme = parseTheme(body.theme_json), mobileTheme = parseTheme(body.mobile_theme_json);
  if (theme === null || mobileTheme === null) return c.json({ code: 400, msg: '桌面/移动主题 JSON 无效；仅支持后台现有主题参数，不能包含自定义脚本' }, 400);
  const siteName = String(body.site_name || '').trim().slice(0, 120);
  if (!siteName) return c.json({ code: 400, msg: '请填写站点名称' }, 400);
  await c.env.DB.prepare(`INSERT INTO site_host_config(hostname,site_name,site_url,site_keywords,site_description,theme_json,mobile_theme_json,status,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(hostname) DO UPDATE SET site_name=excluded.site_name,site_url=excluded.site_url,
      site_keywords=excluded.site_keywords,site_description=excluded.site_description,theme_json=excluded.theme_json,
      mobile_theme_json=excluded.mobile_theme_json,status=excluded.status,updated_at=excluded.updated_at`)
    .bind(hostname, siteName, siteUrl.origin, String(body.site_keywords || '').slice(0, 300), String(body.site_description || '').slice(0, 500), theme, mobileTheme, Number(body.status) === 0 ? 0 : 1, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '站点域名配置已保存' });
});

adminRouter.delete('/sites/:hostname', async (c) => {
  const hostname = String(c.req.param('hostname') || '').trim().toLowerCase();
  const result = await c.env.DB.prepare('DELETE FROM site_host_config WHERE hostname=?').bind(hostname).run();
  return c.json({ code: result.meta.changes ? 0 : 404, msg: result.meta.changes ? '站点域名配置已删除' : '域名配置不存在' }, result.meta.changes ? 200 : 404);
});

// 18. 系统全局配置 API (密码安全落库)
adminRouter.get('/config', async (c) => {
  const configs = await VodService.getConfigs(c.env.DB);
  delete configs.admin_pwd;
  delete configs.user_token_secret;
  configs.mail_smtp_password_set = configs.mail_smtp_password ? '1' : '0';
  configs.payment_secret_set = configs.payment_secret ? '1' : '0';
  configs.meilisearch_api_key_set = configs.meilisearch_api_key ? '1' : '0';
  configs.push_vapid_private_key_set = configs.push_vapid_private_key ? '1' : '0';
  configs.ai_api_key_set = configs.ai_api_key ? '1' : '0';
  configs.turnstile_secret_key_set = configs.turnstile_secret_key ? '1' : '0';
  delete configs.mail_smtp_password;
  delete configs.payment_secret;
  delete configs.meilisearch_api_key;
  delete configs.push_vapid_private_key;
  delete configs.ai_api_key;
  delete configs.turnstile_secret_key;
  configs.telegraph_password_set = configs.telegraph_password ? '1' : '0';
  configs.telegram_bot_token_set = configs.telegram_bot_token ? '1' : '0';
  delete configs.telegraph_password;
  delete configs.telegram_bot_token;
  return c.json({ code: 0, data: configs });
});

adminRouter.post('/config/mail/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    await MemberSecurityService.sendTestEmail(c.env, String(body.email || ''));
    return c.json({ code: 0, msg: '测试邮件已发送，请检查收件箱和垃圾邮件' });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '测试邮件发送失败' }, 400);
  }
});

adminRouter.post('/config', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  const saved = await VodService.getConfigs(db);
  if (body.user_invite_status !== undefined && !['0', '1'].includes(String(body.user_invite_status))) {
    return c.json({ code: 400, msg: '邀请奖励开关值无效' }, 400);
  }
  for (const key of ['user_email_required', 'user_email_verification', 'user_post_audit']) {
    if (body[key] !== undefined && !['0', '1'].includes(String(body[key]))) return c.json({ code: 400, msg: `${key} 必须为 0 或 1` }, 400);
  }
  if (body.search_terms_logging !== undefined && !['0', '1'].includes(String(body.search_terms_logging))) return c.json({ code: 400, msg: '搜索词统计开关值无效' }, 400);
  if (body.ai_semantic_search !== undefined && !['0', '1'].includes(String(body.ai_semantic_search))) return c.json({ code: 400, msg: 'AI 智能搜索开关值无效' }, 400);
  if (body.security_turnstile_enabled !== undefined && !['0', '1'].includes(String(body.security_turnstile_enabled))) return c.json({ code: 400, msg: 'Turnstile 开关值无效' }, 400);
  if (body.payment_provider !== undefined && !['epay', 'generic'].includes(String(body.payment_provider))) return c.json({ code: 400, msg: '支付服务商只能选择易支付或兼容收银台' }, 400);
  if (body.payment_epay_type !== undefined && !['', 'alipay', 'wxpay', 'qqpay', 'bank', 'jdpay', 'paypal', 'usdt', 'stripepay', 'stripealipay', 'stripewxpay'].includes(String(body.payment_epay_type))) {
    return c.json({ code: 400, msg: '易支付收款方式无效' }, 400);
  }
  if (body.turnstile_site_key !== undefined && String(body.turnstile_site_key).trim().length > 200) return c.json({ code: 400, msg: 'Turnstile Site Key 长度无效' }, 400);
  for (const [key, label] of Object.entries({ payment_checkout_url: '支付收银台地址', payment_query_url: '支付查询接口地址', meilisearch_url: 'Meilisearch 地址' })) {
    if (body[key] === undefined || !String(body[key]).trim()) continue;
    let endpoint: URL;
    try { endpoint = new URL(String(body[key]).trim()); } catch { return c.json({ code: 400, msg: `${label}格式无效` }, 400); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return c.json({ code: 400, msg: `${label}必须使用 HTTPS，且不能包含账号密码` }, 400);
  }
  if (body.ai_base_url !== undefined && String(body.ai_base_url).trim()) {
    let endpoint: URL;
    try { endpoint = new URL(String(body.ai_base_url).trim()); } catch { return c.json({ code: 400, msg: 'AI 兼容接口地址格式无效' }, 400); }
    const local = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
    if ((!local && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return c.json({ code: 400, msg: 'AI 接口须使用 HTTPS，且不能包含账号、查询参数或片段' }, 400);
    }
  }
  if (body.ai_model !== undefined && String(body.ai_model).trim().length > 120) return c.json({ code: 400, msg: 'AI 模型名称不能超过 120 个字符' }, 400);
  if (body.payment_products !== undefined) {
    let products: any;
    try { products = JSON.parse(String(body.payment_products)); } catch { return c.json({ code: 400, msg: '支付套餐须为有效 JSON' }, 400); }
    if (!Array.isArray(products) || products.length > 100) return c.json({ code: 400, msg: '支付套餐须为不超过 100 项的 JSON 数组' }, 400);
    const codes = new Set<string>();
    for (const product of products) {
      const code = String(product?.code || '').trim();
      const type = String(product?.type || '');
      const amount = Number(product?.amount_cents);
      if (!/^[A-Za-z0-9_-]{1,48}$/.test(code) || codes.has(code) || !String(product?.name || '').trim()
        || !['points', 'vip'].includes(type) || !Number.isInteger(amount) || amount < 1 || amount > 100000000
        || (type === 'points' && (!Number.isInteger(Number(product?.points)) || Number(product.points) < 1))
        || (type === 'vip' && (!Number.isInteger(Number(product?.vip_days)) || Number(product.vip_days) < 1))) {
        return c.json({ code: 400, msg: '支付套餐字段无效：请检查 code、name、type、amount_cents、points/vip_days' }, 400);
      }
      codes.add(code);
    }
  }
  if (body.mail_smtp_port !== undefined) {
    const port = Number(body.mail_smtp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return c.json({ code: 400, msg: 'SMTP 端口须为 1-65535 的整数' }, 400);
  }
  if (body.mail_smtp_auth_type !== undefined && !['plain', 'login', 'cram-md5'].includes(String(body.mail_smtp_auth_type))) {
    return c.json({ code: 400, msg: 'SMTP 认证方式无效' }, 400);
  }
  if (body.push_vapid_subject !== undefined) {
    const subject = String(body.push_vapid_subject).trim();
    if (!(subject.startsWith('mailto:') || subject.startsWith('https://'))) return c.json({ code: 400, msg: 'VAPID 联系方式须为 mailto: 邮箱或 HTTPS 地址' }, 400);
  }
  for (const key of ['mail_smtp_secure', 'mail_smtp_starttls']) {
    if (body[key] !== undefined && !['0', '1'].includes(String(body[key]))) return c.json({ code: 400, msg: `${key} 必须为 0 或 1` }, 400);
  }
  const emailRequired = String(body.user_email_required ?? saved.user_email_required ?? '0') === '1';
  const smtpHost = String(body.mail_smtp_host ?? saved.mail_smtp_host ?? '').trim();
  const smtpFrom = String(body.mail_from ?? saved.mail_from ?? '').trim();
  if (emailRequired && (!smtpHost || !smtpFrom)) return c.json({ code: 400, msg: '强制邮箱验证前，请先配置 SMTP 主机和发件人地址' }, 400);
  const turnstileEnabled = String(body.security_turnstile_enabled ?? saved.security_turnstile_enabled ?? '0') === '1';
  const turnstileSiteKey = String(body.turnstile_site_key ?? saved.turnstile_site_key ?? '').trim();
  const turnstileSecret = String(body.turnstile_secret_key ?? saved.turnstile_secret_key ?? '').trim();
  if (turnstileEnabled && (!turnstileSiteKey || !turnstileSecret)) return c.json({ code: 400, msg: '启用 Turnstile 前请填写 Site Key 和 Secret Key' }, 400);
  if (body.mail_smtp_host !== undefined && (smtpHost.length > 253 || /[\s/\\@]/.test(smtpHost))) {
    return c.json({ code: 400, msg: 'SMTP 主机格式无效' }, 400);
  }
  for (const key of ['user_invite_points', 'user_invited_points']) {
    if (body[key] !== undefined) {
      const points = Number(body[key]);
      if (!Number.isInteger(points) || points < 0 || points > 100000) return c.json({ code: 400, msg: '邀请奖励积分须为 0–100000 的整数' }, 400);
    }
  }
  if (body.media_storage_provider !== undefined && !['r2', 'telegraph', 'telegram'].includes(String(body.media_storage_provider))) {
    return c.json({ code: 400, msg: '图片存储后端只能选择 R2、TG Bot 或 Telegraph 服务' }, 400);
  }
  if (body.telegraph_base_url !== undefined && String(body.telegraph_base_url).trim()) {
    let endpoint: URL;
    try { endpoint = new URL(String(body.telegraph_base_url).trim()); } catch { return c.json({ code: 400, msg: 'Telegraph 服务地址格式无效' }, 400); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return c.json({ code: 400, msg: 'Telegraph 服务地址必须是 HTTPS，且不能包含账号、查询参数或片段' }, 400);
    }
  }
  if (body.telegram_api_base !== undefined && String(body.telegram_api_base).trim()) {
    let endpoint: URL;
    try { endpoint = new URL(String(body.telegram_api_base).trim()); } catch { return c.json({ code: 400, msg: 'Telegram Bot API 地址格式无效' }, 400); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return c.json({ code: 400, msg: 'Telegram Bot API 地址必须是 HTTPS，且不能包含账号、查询参数或片段' }, 400);
    }
  }
  const settingProvider = body.media_storage_provider === undefined
    ? (await VodService.getConfigs(db)).media_storage_provider || 'r2'
    : String(body.media_storage_provider);
  if (settingProvider === 'telegraph') {
    const existing = await VodService.getConfigs(db);
    const url = String(body.telegraph_base_url ?? existing.telegraph_base_url ?? '').trim();
    const username = String(body.telegraph_username ?? existing.telegraph_username ?? '').trim();
    const password = String(body.telegraph_password ?? existing.telegraph_password ?? '');
    if (!url || !username || !password) return c.json({ code: 400, msg: '启用 Telegraph 前请填写服务地址、USERNAME 和 PASSWORD' }, 400);
  } else if (settingProvider === 'telegram') {
    const existing = await VodService.getConfigs(db);
    const token = String(body.telegram_bot_token ?? existing.telegram_bot_token ?? '').trim();
    const chatId = String(body.telegram_chat_id ?? existing.telegram_chat_id ?? '').trim();
    const pool = await db.prepare('SELECT COUNT(*) AS c FROM telegram_storage_account WHERE enabled=1 AND bot_token<>\'\' AND chat_id<>\'\'').first<{ c: number }>();
    if (!(pool?.c || 0) && (!token || !chatId)) return c.json({ code: 400, msg: '启用 TG Bot 前请在媒体库账户池至少添加一个账户' }, 400);
  }

  for (const [key, val] of Object.entries(body)) {
    if ((key === 'new_password' || key === 'admin_pwd') && typeof val === 'string' && val.trim()) {
      const hash = await AuthUtils.sha256(val.trim());
      await VodService.setConfig(db, 'admin_pwd', hash);
    } else if (key === 'telegraph_password' && typeof val === 'string' && val.trim()) {
      await VodService.setConfig(db, key, val);
    } else if (key === 'telegram_bot_token' && typeof val === 'string' && val.trim()) {
      await VodService.setConfig(db, key, val);
    } else if (['mail_smtp_password', 'payment_secret', 'meilisearch_api_key', 'push_vapid_private_key', 'ai_api_key', 'turnstile_secret_key'].includes(key) && typeof val === 'string' && val.trim()) {
      await VodService.setConfig(db, key, val.trim());
    } else if (key !== 'new_password' && key !== 'admin_pwd' && key !== 'user_token_secret' && key !== 'telegraph_password' && key !== 'telegram_bot_token' && key !== 'turnstile_secret_key') {
      await VodService.setConfig(db, key, String(val));
    }
  }

  return c.json({ code: 0, msg: '系统配置已更新' });
});

adminRouter.route('/cloud', cloudAdminRouter);
