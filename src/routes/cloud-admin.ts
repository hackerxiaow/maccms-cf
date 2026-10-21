// Cloudflare-native MacCMS extensions: D1 operations, R2 media, moderation,
// lightweight commerce, scheduled work and administrator role management.
import { Hono } from 'hono';
import type { Bindings, CollectNodeItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { CollectorService } from '../services/collector.ts';
import { SearchService } from '../services/search.ts';
import { WebPushService } from '../services/web-push.ts';
import { ContentTranslationService, TRANSLATION_FIELDS } from '../services/content-translation.ts';
import { AiService } from '../services/ai.ts';

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

// Only these known image columns are inspected or changed by remote image sync.
const IMAGE_SOURCES: Array<{ model: string; table: string; id: string; name: string; fields: string[] }> = [
  { model: 'type', table: 'type', id: 'type_id', name: 'type_name', fields: ['type_logo', 'type_pic'] },
  { model: 'vod', table: 'vod', id: 'vod_id', name: 'vod_name', fields: ['vod_pic', 'vod_pic_thumb', 'vod_pic_slide', 'vod_pic_screenshot'] },
  { model: 'art', table: 'art', id: 'art_id', name: 'art_name', fields: ['art_pic', 'art_pic_thumb', 'art_pic_slide'] },
  { model: 'topic', table: 'topic', id: 'topic_id', name: 'topic_name', fields: ['topic_pic', 'topic_pic_thumb', 'topic_pic_slide'] },
  { model: 'manga', table: 'manga', id: 'manga_id', name: 'manga_name', fields: ['manga_pic', 'manga_pic_thumb', 'manga_pic_slide', 'manga_pic_screenshot'] },
  { model: 'actor', table: 'actor', id: 'actor_id', name: 'actor_name', fields: ['actor_pic'] },
  { model: 'role', table: 'role', id: 'role_id', name: 'role_name', fields: ['role_pic'] },
  { model: 'website', table: 'website', id: 'website_id', name: 'website_name', fields: ['website_pic', 'website_logo'] },
  { model: 'user', table: 'user', id: 'user_id', name: 'user_name', fields: ['user_pic'] },
  { model: 'link', table: 'link', id: 'link_id', name: 'link_name', fields: ['link_logo'] },
  { model: 'live', table: 'live_channel', id: 'channel_id', name: 'channel_name', fields: ['live_logo'] },
  { model: 'goods', table: 'mall_goods', id: 'goods_id', name: 'goods_name', fields: ['goods_pic'] },
];

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif',
};
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function isPublicImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if ((url.protocol === 'http:' && url.port && url.port !== '80') || (url.protocol === 'https:' && url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host || host === 'localhost' || host === 'metadata' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localdomain')) return null;
    // Reject IPv6 literals conservatively; the scanner does not need them and this avoids local IPv6 ranges.
    if (host.includes(':')) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const parts = host.split('.').map(Number);
      if (parts.some((part) => part > 255) || parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224 ||
        (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
        (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))) return null;
    }
    return url;
  } catch { return null; }
}

async function readImageBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > IMAGE_MAX_BYTES) throw new Error('图片超过 10 MB');
  if (!response.body) throw new Error('远端图片没有响应内容');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > IMAGE_MAX_BYTES) { await reader.cancel(); throw new Error('图片超过 10 MB'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export type MediaStorageConfig = {
  provider: 'r2' | 'telegraph' | 'telegram';
  telegraphUrl: string;
  username: string;
  password: string;
  authEnabled: boolean;
  tgBotToken: string;
  tgChatId: string;
  tgApiBase: string;
};
type TelegramStorageAccount = { account_id: number; account_name: string; bot_token: string; chat_id: string; weight: number };

export async function loadMediaStorageConfig(db: D1Database): Promise<MediaStorageConfig> {
  const rows = await db.prepare(`SELECT key,value FROM config WHERE key IN
    ('media_storage_provider','telegraph_base_url','telegraph_username','telegraph_password','telegraph_auth_enabled',
     'telegram_bot_token','telegram_chat_id','telegram_api_base')`).all<{ key: string; value: string }>();
  const values: Record<string, string> = {};
  for (const row of rows.results || []) values[row.key] = row.value;
  return {
    provider: values.media_storage_provider === 'telegram' ? 'telegram' : values.media_storage_provider === 'telegraph' ? 'telegraph' : 'r2',
    telegraphUrl: values.telegraph_base_url || '',
    username: values.telegraph_username || '',
    password: values.telegraph_password || '',
    authEnabled: values.telegraph_auth_enabled === '1',
    tgBotToken: values.telegram_bot_token || '',
    tgChatId: values.telegram_chat_id || '',
    tgApiBase: values.telegram_api_base || 'https://api.telegram.org',
  };
}

function telegraphBase(settings: MediaStorageConfig): URL {
  let base: URL;
  try { base = new URL(settings.telegraphUrl); } catch { throw new Error('请先填写有效的 Telegraph 服务地址'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Telegraph 服务地址必须是 HTTPS 地址，且不能包含账号或参数');
  base.pathname = base.pathname.replace(/\/+$/, '');
  return base;
}

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function chooseTelegramAccount(db: D1Database, settings: MediaStorageConfig): Promise<TelegramStorageAccount> {
  const rows = await db.prepare(`SELECT account_id,account_name,bot_token,chat_id,weight FROM telegram_storage_account
    WHERE enabled=1 AND bot_token<>'' AND chat_id<>'' ORDER BY account_id ASC`).all<TelegramStorageAccount>();
  const accounts = rows.results || [];
  if (!accounts.length) {
    const configured = await db.prepare('SELECT COUNT(*) AS c FROM telegram_storage_account').first<{ c: number }>();
    if (!(configured?.c || 0) && settings.tgBotToken && settings.tgChatId) return { account_id: 0, account_name: '默认 TG Bot', bot_token: settings.tgBotToken, chat_id: settings.tgChatId, weight: 1 };
    throw new Error('请在媒体库的 TG Bot 账户池中添加并启用至少一个账户');
  }
  const normalized = accounts.map((account) => ({ ...account, weight: Math.min(100, Math.max(1, Number(account.weight) || 1)) }));
  const totalWeight = normalized.reduce((sum, account) => sum + account.weight, 0);
  await db.prepare(`INSERT OR IGNORE INTO telegram_storage_state (state_key,counter) VALUES ('upload',0)`).run();
  const state = await db.prepare(`UPDATE telegram_storage_state SET counter=counter+1 WHERE state_key='upload' RETURNING counter`)
    .first<{ counter: number }>();
  const slot = ((Number(state?.counter || 1) - 1) % totalWeight) + 1;
  let cursor = 0;
  const selected = normalized.find((account) => { cursor += account.weight; return slot <= cursor; }) || normalized[0];
  await db.prepare('UPDATE telegram_storage_account SET last_used_at=?,last_error=\'\' WHERE account_id=?')
    .bind(Math.floor(Date.now() / 1000), selected.account_id).run();
  return selected;
}

export async function uploadToTelegraph(settings: MediaStorageConfig, file: Blob, fileName: string, contentType: string): Promise<string> {
  if (!settings.username || !settings.password) throw new Error('请填写 Telegraph 部署时设置的 USERNAME 和 PASSWORD');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) {
    throw new Error('当前 Telegraph 部署仅支持 JPEG、PNG、WebP、GIF；AVIF 请切换到 R2');
  }
  const base = telegraphBase(settings);
  const endpoint = new URL(`${base.pathname}/upload`, base.origin);
  const form = new FormData();
  form.append('file', new File([file], fileName || `image.${IMAGE_MIME_EXT[contentType]}`, { type: contentType }));
  const headers = new Headers();
  if (settings.username && settings.password) headers.set('Authorization', basicAuthorization(settings.username, settings.password));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try { response = await fetch(endpoint, { method: 'POST', headers, body: form, redirect: 'manual', signal: controller.signal }); }
  finally { clearTimeout(timeout); }
  if (response.status >= 300 && response.status < 400) throw new Error('Telegraph 服务返回跳转，请检查配置的服务地址');
  const body = await response.json().catch(() => ({})) as { data?: unknown; error?: string; message?: string };
  if (!response.ok || body.error) throw new Error(String(body.error || body.message || `Telegraph 上传失败（HTTP ${response.status}）`).slice(0, 500));
  const candidate = typeof body.data === 'string' ? body.data : '';
  let remote: URL;
  try { remote = new URL(candidate, base.origin); } catch { throw new Error('Telegraph 上传接口没有返回可用的图片 URL'); }
  if (remote.protocol !== 'https:' || remote.host !== base.host || remote.username || remote.password) throw new Error('Telegraph 返回了非本站 HTTPS 图片地址，已拒绝保存');
  return remote.toString();
}

export async function uploadToTelegram(db: D1Database, settings: MediaStorageConfig, file: Blob, fileName: string, contentType: string, origin: string): Promise<{ fileId: string; providerRef: string; objectKey: string; publicUrl: string; accountId: number }> {
  const account = await chooseTelegramAccount(db, settings);
  const extension = IMAGE_MIME_EXT[contentType];
  if (!extension || !['jpg', 'png', 'webp', 'gif'].includes(extension)) throw new Error('TG Bot 存储当前支持 JPEG、PNG、WebP、GIF 图片');
  let apiBase: URL;
  try { apiBase = new URL(settings.tgApiBase); } catch { throw new Error('Telegram Bot API 地址无效'); }
  if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password || apiBase.search || apiBase.hash) throw new Error('Telegram Bot API 地址必须是 HTTPS 地址');
  apiBase.pathname = apiBase.pathname.replace(/\/+$/, '');
  const apiUrl = new URL(`${apiBase.pathname}/bot${account.bot_token}/sendDocument`, apiBase.origin);
  const form = new FormData();
  form.append('chat_id', account.chat_id);
  form.append('document', new File([file], fileName || `image.${extension}`, { type: contentType }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let response: Response;
    try { response = await fetch(apiUrl, { method: 'POST', body: form, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { document?: { file_id?: string }; video?: { file_id?: string }; sticker?: { file_id?: string } } };
    if (!response.ok || !result.ok) throw new Error(String(result.description || `Telegram 上传失败（HTTP ${response.status}）`).slice(0, 500));
    const fileId = result.result?.document?.file_id || result.result?.video?.file_id || result.result?.sticker?.file_id;
    if (!fileId) throw new Error('Telegram 没有返回文件 ID');
    if (account.account_id > 0) await db.prepare(`UPDATE telegram_storage_account SET upload_count=upload_count+1,last_error='',updated_at=? WHERE account_id=?`)
      .bind(Math.floor(Date.now() / 1000), account.account_id).run();
    const slug = crypto.randomUUID();
    return { fileId, providerRef: `${account.account_id}:${fileId}`, accountId: account.account_id, objectKey: `telegram:${slug}`, publicUrl: `${origin}/media/tg/${slug}.${extension}` };
  } catch (error) {
    if (account.account_id > 0) await db.prepare(`UPDATE telegram_storage_account SET failure_count=failure_count+1,last_error=?,updated_at=? WHERE account_id=?`)
      .bind((error instanceof Error ? error.message : 'TG Bot 上传失败').slice(0, 500), Math.floor(Date.now() / 1000), account.account_id).run().catch(() => {});
    throw error;
  }
}

async function deleteFromTelegraph(settings: MediaStorageConfig, publicUrl: string): Promise<void> {
  if (!settings.username || !settings.password) throw new Error('删除 Telegraph 图片需要填写该服务的 USERNAME 和 PASSWORD');
  const base = telegraphBase(settings);
  const remote = new URL(publicUrl);
  if (remote.protocol !== 'https:' || remote.host !== base.host) throw new Error('图片 URL 与当前 Telegraph 服务域名不一致');
  const endpoint = new URL(`${base.pathname}/delete-images`, base.origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: basicAuthorization(settings.username, settings.password), 'Content-Type': 'application/json' }, body: JSON.stringify([remote.toString()]), redirect: 'manual', signal: controller.signal });
  } finally { clearTimeout(timeout); }
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok && response.status !== 404) throw new Error(String(body.error || body.message || `Telegraph 删除失败（HTTP ${response.status}）`));
}

export async function deleteStoredMedia(provider: string, bucket: R2Bucket | undefined, settings: MediaStorageConfig, key: string, publicUrl: string): Promise<void> {
  if (provider === 'telegraph') await deleteFromTelegraph(settings, publicUrl);
  else if (provider === 'telegram') return; // The upstream TG Bot backend removes URL mappings, not channel messages.
  else if (bucket) await bucket.delete(key);
  else throw new Error('R2 媒体桶尚未绑定');
}

async function memberAvatarReferenceCount(db: D1Database, publicUrl: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM user WHERE instr(user_pic,?)>0").bind(publicUrl).first<{ c: number }>();
  return Number(row?.c || 0);
}

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
  const projection = c.req.param('resource') === 'mall-orders'
    ? `*,(SELECT status FROM payment_intent p WHERE p.mall_order_id=mall_order.mall_order_id ORDER BY payment_id DESC LIMIT 1) AS payment_status`
    : '*';
  const rows = await c.env.DB.prepare(`SELECT ${projection} FROM ${resource.table} ${where}
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
  const result = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE mall_order SET status=?,updated_at=? WHERE mall_order_id=? AND status=?')
      .bind(target, Math.floor(Date.now() / 1000), id, expected),
    ...(target === 1 || target === 3 ? [c.env.DB.prepare("UPDATE payment_intent SET status='cancelled' WHERE mall_order_id=? AND status='pending' AND changes()=1").bind(id)] : []),
  ]);
  if (!result[0]?.meta.changes) return c.json({ code: 409, msg: '订单状态已变化，刷新后重试' }, 409);
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
  const amountCents = Math.max(-10000000, Math.min(10000000, Math.round((Number(body.amount) || 0) * 100)));
  const amount = amountCents / 100;
  if (!Number.isInteger(userId) || userId <= 0 || (!points && !amountCents)) return c.json({ code: 400, msg: '会员 ID 有效且积分或钱包金额至少填写一项' }, 400);
  const admin = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_user'").first<{ value: string }>();
  const user = await c.env.DB.prepare('SELECT user_points FROM user WHERE user_id=?').bind(userId).first<{ user_points: number }>();
  if (!user) return c.json({ code: 404, msg: '会员不存在' }, 404);
  if (points && user.user_points + points < 0) return c.json({ code: 400, msg: '调整后积分不能小于 0' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const statements = await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO user_wallet(user_id,balance_cents,updated_at) VALUES(?,0,?)').bind(userId, now),
    c.env.DB.prepare(`UPDATE user SET user_points=user_points+?
      WHERE user_id=? AND user_points+?>=0
      AND EXISTS (SELECT 1 FROM user_wallet WHERE user_id=? AND balance_cents+?>=0)`)
      .bind(points, userId, points, userId, amountCents),
    c.env.DB.prepare('UPDATE user_wallet SET balance_cents=balance_cents+?,updated_at=? WHERE user_id=? AND changes()=1')
      .bind(amountCents, now, userId),
    c.env.DB.prepare(`INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
      SELECT ?,'admin_adjustment',?,?,1,?,?,? WHERE changes()=1`)
      .bind(userId, amount, points, String(body.note || '').slice(0, 500), admin?.value || 'admin', now),
  ]);
  if (!statements[1]?.meta.changes) {
    const [latestUser, latestWallet] = await Promise.all([
      c.env.DB.prepare('SELECT user_points FROM user WHERE user_id=?').bind(userId).first<{ user_points: number }>(),
      c.env.DB.prepare('SELECT balance_cents FROM user_wallet WHERE user_id=?').bind(userId).first<{ balance_cents: number }>(),
    ]);
    if (Number(latestUser?.user_points || 0) + points < 0) return c.json({ code: 400, msg: '调整后积分不能小于 0' }, 400);
    if (Number(latestWallet?.balance_cents || 0) + amountCents < 0) return c.json({ code: 400, msg: '钱包余额不足，不能扣至负数' }, 400);
    return c.json({ code: 409, msg: '余额数据已变化，请刷新后重试' }, 409);
  }
  if (!statements[2]?.meta.changes) return c.json({ code: 409, msg: '钱包余额数据已变化，请刷新后核对' }, 409);
  const wallet = await c.env.DB.prepare('SELECT balance_cents FROM user_wallet WHERE user_id=?').bind(userId).first<{ balance_cents: number }>();
  return c.json({ code: 0, msg: `已调整积分 ${points}，钱包 ¥ ${(Number(wallet?.balance_cents || 0) / 100).toFixed(2)}` });
});

cloudAdminRouter.get('/withdrawals', async (c) => {
  const status = String(c.req.query('status') || 'all');
  const where = ['pending', 'approved', 'rejected', 'paid'].includes(status) ? 'WHERE w.status=?' : '';
  const statement = c.env.DB.prepare(`SELECT w.*,u.user_name FROM cash_withdrawal w JOIN user u ON u.user_id=w.user_id
    ${where} ORDER BY w.withdrawal_id DESC LIMIT 200`);
  const rows = where ? await statement.bind(status).all() : await statement.all();
  const totals = await c.env.DB.prepare(`SELECT status,COUNT(*) AS count,COALESCE(SUM(amount_cents),0) AS amount_cents
    FROM cash_withdrawal GROUP BY status`).all();
  return c.json({ code: 0, data: { list: rows.results || [], totals: totals.results || [] } });
});

cloudAdminRouter.post('/withdrawals/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const action = String(body.status || '');
  const note = String(body.note || '').trim().slice(0, 500);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(id) || id <= 0 || !['approved', 'rejected', 'paid'].includes(action)) return c.json({ code: 400, msg: '提现处理参数无效' }, 400);
  const admin = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_user'").first<{ value: string }>();
  if (action === 'approved') {
    const result = await c.env.DB.prepare(`UPDATE cash_withdrawal SET status='approved',note=?,updated_at=? WHERE withdrawal_id=? AND status='pending'`)
      .bind(note, now, id).run();
    if (!result.meta.changes) return c.json({ code: 409, msg: '申请已处理或不存在' }, 409);
  } else if (action === 'rejected') {
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE cash_withdrawal SET status='rejected',note=?,updated_at=? WHERE withdrawal_id=? AND status IN ('pending','approved')`)
        .bind(note, now, id),
      c.env.DB.prepare(`UPDATE user_wallet SET balance_cents=balance_cents+(SELECT amount_cents FROM cash_withdrawal WHERE withdrawal_id=?),updated_at=?
        WHERE user_id=(SELECT user_id FROM cash_withdrawal WHERE withdrawal_id=? AND status='rejected') AND changes()=1`).bind(id, now, id),
      c.env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
        SELECT user_id,'withdrawal_refund',amount_cents/100,0,1,?,?,? FROM cash_withdrawal WHERE withdrawal_id=? AND status='rejected' AND changes()=1`)
        .bind(note || '提现申请已驳回，钱包金额退回', admin?.value || 'admin', now, id),
    ]);
    if (!result[0]?.meta.changes) return c.json({ code: 409, msg: '申请已处理或不存在' }, 409);
  } else {
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE cash_withdrawal SET status='paid',note=?,updated_at=? WHERE withdrawal_id=? AND status IN ('pending','approved')`)
        .bind(note, now, id),
      c.env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
        SELECT user_id,'withdrawal_paid',0,0,1,?,?,? FROM cash_withdrawal WHERE withdrawal_id=? AND status='paid' AND changes()=1`)
        .bind(note || '提现已汇款', admin?.value || 'admin', now, id),
    ]);
    if (!result[0]?.meta.changes) return c.json({ code: 409, msg: '申请已处理或不存在' }, 409);
  }
  return c.json({ code: 0, msg: action === 'approved' ? '提现申请已通过' : action === 'rejected' ? '提现申请已驳回，钱包余额已退回' : '已登记提现汇款完成' });
});

cloudAdminRouter.get('/posts', async (c) => {
  const requested = c.req.query('status');
  const status = requested === undefined || requested === '' ? -1 : Number(requested);
  const rows = status >= 0 && status <= 2
    ? await c.env.DB.prepare(`SELECT p.*,u.user_name,u.user_nick FROM user_post p JOIN user u ON u.user_id=p.user_id
        WHERE p.status=? ORDER BY p.post_id DESC LIMIT 300`).bind(status).all()
    : await c.env.DB.prepare(`SELECT p.*,u.user_name,u.user_nick FROM user_post p JOIN user u ON u.user_id=p.user_id
        ORDER BY p.post_id DESC LIMIT 300`).all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.post('/posts/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const status = Number(body.status);
  if (!Number.isInteger(id) || id <= 0 || ![0, 1, 2].includes(status)) return c.json({ code: 400, msg: '动态审核参数无效' }, 400);
  const updated = await c.env.DB.prepare('UPDATE user_post SET status=? WHERE post_id=? AND status<>?').bind(status, id, status).run();
  if (!updated.meta.changes) {
    const exists = await c.env.DB.prepare('SELECT post_id FROM user_post WHERE post_id=?').bind(id).first();
    if (!exists) return c.json({ code: 404, msg: '动态不存在' }, 404);
    return c.json({ code: 0, msg: '动态状态未变化' });
  }
  if (status === 1) {
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`INSERT INTO user_notification(user_id,title,body,kind,target_url,created_at)
      SELECT user_id,'动态审核通过','你的动态已通过审核并发布','social','/user.html',?
      FROM user_post WHERE post_id=?`).bind(now, id).run();
  }
  return c.json({ code: 0, msg: status === 1 ? '动态已发布' : status === 2 ? '动态已驳回' : '动态已设为待审核' });
});

cloudAdminRouter.get('/posts/reports', async (c) => {
  const status = String(c.req.query('status') || 'open');
  const rows = status === 'all'
    ? await c.env.DB.prepare(`SELECT r.*,p.content,p.status AS post_status,u.user_name,u.user_nick,reporter.user_name AS reporter_name,reporter.user_nick AS reporter_nick
        FROM user_post_report r JOIN user_post p ON p.post_id=r.post_id JOIN user u ON u.user_id=p.user_id JOIN user reporter ON reporter.user_id=r.user_id
        ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300`).all()
    : await c.env.DB.prepare(`SELECT r.*,p.content,p.status AS post_status,u.user_name,u.user_nick,reporter.user_name AS reporter_name,reporter.user_nick AS reporter_nick
        FROM user_post_report r JOIN user_post p ON p.post_id=r.post_id JOIN user u ON u.user_id=p.user_id JOIN user reporter ON reporter.user_id=r.user_id
        WHERE r.status=? ORDER BY r.created_at DESC LIMIT 300`).bind(status).all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.post('/posts/reports/:id/status', async (c) => {
  const id = Number(c.req.param('id')), body = await c.req.json().catch(() => ({}));
  const action = String(body.action || 'reviewed');
  if (!Number.isInteger(id) || id <= 0 || !['reviewed','dismissed','hide'].includes(action)) return c.json({ code: 400, msg: '举报处理参数无效' }, 400);
  const report = await c.env.DB.prepare('SELECT report_id,post_id FROM user_post_report WHERE report_id=?').bind(id).first<{ report_id: number; post_id: number }>();
  if (!report) return c.json({ code: 404, msg: '举报记录不存在' }, 404);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE user_post_report SET status=?,reviewed_at=? WHERE report_id=?').bind(action === 'hide' ? 'reviewed' : action, now, id),
    ...(action === 'hide' ? [c.env.DB.prepare('UPDATE user_post SET status=2 WHERE post_id=?').bind(report.post_id)] : []),
  ]);
  return c.json({ code: 0, msg: action === 'hide' ? '举报已处理，动态已下架' : action === 'dismissed' ? '举报已标记为不成立' : '举报已标记为已核查' });
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

const RESOURCE_SOURCES: Record<string, { table: string; id: string; name: string; fields: string[] }> = {
  vod: { table: 'vod', id: 'vod_id', name: 'vod_name', fields: ['vod_pic', 'vod_pic_thumb', 'vod_pic_slide', 'vod_pic_screenshot', 'vod_play_url', 'vod_down_url'] },
  art: { table: 'art', id: 'art_id', name: 'art_name', fields: ['art_pic', 'art_pic_thumb', 'art_pic_slide'] },
  topic: { table: 'topic', id: 'topic_id', name: 'topic_name', fields: ['topic_pic', 'topic_pic_thumb', 'topic_pic_slide'] },
  actor: { table: 'actor', id: 'actor_id', name: 'actor_name', fields: ['actor_pic'] },
  role: { table: 'role', id: 'role_id', name: 'role_name', fields: ['role_pic'] },
  manga: { table: 'manga', id: 'manga_id', name: 'manga_name', fields: ['manga_pic', 'manga_pic_thumb', 'manga_pic_slide', 'manga_pic_screenshot', 'manga_chapter_url'] },
  website: { table: 'website', id: 'website_id', name: 'website_name', fields: ['website_url', 'website_logo'] },
};

cloudAdminRouter.get('/resources/stats', async (c) => {
  const [totals, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS checked,SUM(CASE WHEN status_code>=400 OR status_code=0 THEN 1 ELSE 0 END) AS failed
      FROM resource_check_item`).first<{ checked: number; failed: number }>(),
    c.env.DB.prepare(`SELECT model,status_code,COUNT(*) AS count,MAX(checked_at) AS last_checked
      FROM resource_check_item GROUP BY model,status_code ORDER BY model,status_code`).all(),
  ]);
  return c.json({ code: 0, data: { checked: Number(totals?.checked || 0), failed: Number(totals?.failed || 0), rows: rows.results || [] } });
});

cloudAdminRouter.get('/resources/results', async (c) => {
  const model = String(c.req.query('model') || '').slice(0, 30);
  const failed = c.req.query('failed') === '1';
  const rows = model
    ? await c.env.DB.prepare(`SELECT * FROM resource_check_item WHERE model LIKE ? ${failed ? 'AND (status_code>=400 OR status_code=0)' : ''}
        ORDER BY checked_at DESC LIMIT 100`).bind(`${model}:%`).all()
    : await c.env.DB.prepare(`SELECT * FROM resource_check_item ${failed ? 'WHERE status_code>=400 OR status_code=0' : ''}
        ORDER BY checked_at DESC LIMIT 100`).all();
  return c.json({ code: 0, data: rows.results || [] });
});

cloudAdminRouter.post('/resources/check', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = String(body.model || 'vod');
  const spec = RESOURCE_SOURCES[model];
  const afterId = Math.max(0, Number(body.after_id) || 0);
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 5));
  if (!spec) return c.json({ code: 400, msg: '资源检查模型无效' }, 400);
  const selection = [spec.id, spec.name, ...spec.fields].join(',');
  const page = await c.env.DB.prepare(`SELECT ${selection} FROM ${spec.table} WHERE ${spec.id}>? ORDER BY ${spec.id} LIMIT ?`)
    .bind(afterId, limit).all<Record<string, unknown>>();
  const candidates: Array<{ model: string; record_id: number; url: string }> = [];
  const pattern = /https?:\/\/[^\s"'<>$#|,，]+/gi;
  for (const row of page.results || []) {
    const recordId = Number(row[spec.id] || 0);
    for (const field of spec.fields) {
      const value = String(row[field] || '');
      const match = value.match(pattern);
      const url = match?.[0].replace(/[\])}.，。；;]+$/g, '') || '';
      if (url && !candidates.some((candidate) => candidate.record_id === recordId && candidate.url === url)) {
        candidates.push({ model: `${model}:${field}`, record_id: recordId, url });
      }
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const results = await Promise.all(candidates.map(async (candidate) => {
    const started = Date.now();
    let statusCode = 0, error = '';
    try {
      const url = new URL(candidate.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('仅支持 HTTP/HTTPS 地址');
      const host = url.hostname.toLowerCase();
      if (url.username || url.password || host === 'localhost' || host.endsWith('.local') || host.startsWith('[') || host === 'metadata.google.internal'
        || /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error('拒绝检查本地或私网地址');
      let response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
        await response.body?.cancel();
      }
      statusCode = response.status;
      if (statusCode >= 400) error = `HTTP ${statusCode}`;
    } catch (reason) {
      error = (reason instanceof Error ? reason.message : '请求失败').slice(0, 500);
    }
    return { ...candidate, status_code: statusCode, latency_ms: Date.now() - started, checked_at: now, error };
  }));
  if (results.length) {
    const statements = results.map((row) => c.env.DB.prepare(`INSERT INTO resource_check_item(model,record_id,url,status_code,latency_ms,checked_at,error)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(model,record_id,url) DO UPDATE SET status_code=excluded.status_code,
      latency_ms=excluded.latency_ms,checked_at=excluded.checked_at,error=excluded.error`)
      .bind(row.model, row.record_id, row.url, row.status_code, row.latency_ms, row.checked_at, row.error));
    for (let index = 0; index < statements.length; index += 20) await c.env.DB.batch(statements.slice(index, index + 20));
  }
  const rows = page.results || [];
  const nextId = rows.length ? Number(rows[rows.length - 1][spec.id] || 0) : 0;
  return c.json({ code: 0, msg: `检查完成：检测 ${results.length} 个地址`, data: { checked: results.length, failed: results.filter((row) => row.status_code === 0 || row.status_code >= 400).length, next_id: nextId, done: rows.length < limit, results } });
});

cloudAdminRouter.get('/translations', async (c) => {
  const model = String(c.req.query('model') || '');
  const recordId = Number(c.req.query('record_id') || 0);
  const language = String(c.req.query('language') || '');
  if (!TRANSLATION_FIELDS[model] || !Number.isInteger(recordId) || recordId <= 0 || !ContentTranslationService.validLanguage(language)) {
    return c.json({ code: 400, msg: '模型、内容 ID 或语言代码无效' }, 400);
  }
  const rows = await c.env.DB.prepare(`SELECT field_name,translated_value FROM content_translation
    WHERE model=? AND record_id=? AND language=? ORDER BY field_name`).bind(model, recordId, language).all<{ field_name: string; translated_value: string }>();
  return c.json({ code: 0, data: Object.fromEntries((rows.results || []).map((row) => [row.field_name, row.translated_value])) });
});

cloudAdminRouter.post('/translations/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = String(body.model || '');
  const recordId = Number(body.record_id || 0);
  const language = String(body.language || '');
  const fields = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields as Record<string, unknown> : {};
  if (!TRANSLATION_FIELDS[model] || !Number.isInteger(recordId) || recordId <= 0 || !ContentTranslationService.validLanguage(language)) {
    return c.json({ code: 400, msg: '模型、内容 ID 或语言代码无效' }, 400);
  }
  const target = MODELS[model];
  const exists = await c.env.DB.prepare(`SELECT ${target.id} FROM ${target.table} WHERE ${target.id}=?`).bind(recordId).first();
  if (!exists) return c.json({ code: 404, msg: '指定内容不存在' }, 404);
  const entries = Object.entries(fields);
  if (entries.some(([key, value]) => !TRANSLATION_FIELDS[model].includes(key) || typeof value !== 'string' || value.length > 20000)) {
    return c.json({ code: 400, msg: '字段须使用该模型的可翻译字段名，每个译文最多 20000 字符' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const statements = [c.env.DB.prepare('DELETE FROM content_translation WHERE model=? AND record_id=? AND language=?').bind(model, recordId, language),
    ...entries.filter(([, value]) => String(value).trim()).map(([field, value]) => c.env.DB.prepare(`INSERT INTO content_translation(model,record_id,language,field_name,translated_value,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(model,record_id,language,field_name) DO UPDATE SET translated_value=excluded.translated_value,updated_at=excluded.updated_at`)
    .bind(model, recordId, language, field, value as string, now))];
  await c.env.DB.batch(statements);
  return c.json({ code: 0, msg: `已保存 ${statements.length - 1} 个翻译字段` });
});

cloudAdminRouter.delete('/translations/:model/:recordId/:language/:field', async (c) => {
  const model = c.req.param('model');
  const recordId = Number(c.req.param('recordId'));
  const language = c.req.param('language');
  const field = c.req.param('field');
  if (!TRANSLATION_FIELDS[model] || !Number.isInteger(recordId) || recordId <= 0 || !ContentTranslationService.validLanguage(language) || !TRANSLATION_FIELDS[model].includes(field)) {
    return c.json({ code: 400, msg: '翻译删除参数无效' }, 400);
  }
  await c.env.DB.prepare('DELETE FROM content_translation WHERE model=? AND record_id=? AND language=? AND field_name=?')
    .bind(model, recordId, language, field).run();
  return c.json({ code: 0, msg: '翻译已删除' });
});

cloudAdminRouter.get('/ai/status', async (c) => c.json({ code: 0, data: await AiService.status(c.env.DB) }));

cloudAdminRouter.post('/ai/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const suggestion = await AiService.generate(c.env, {
      model: String(body.model || ''), recordId: Number(body.record_id), task: String(body.task || 'summary') as 'summary' | 'metadata' | 'seo' | 'recommendations' | 'quality' | 'profile',
    });
    return c.json({ code: 0, msg: 'AI 建议已生成；请审核后再复制到内容字段', data: { suggestion } });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : 'AI 内容生成失败' }, 400);
  }
});

cloudAdminRouter.get('/search/stats', async (c) => {
  const days = Number(c.req.query('days') || 30);
  const stats = await SearchService.stats(c.env.DB, days);
  const config = await c.env.DB.prepare("SELECT key,value FROM config WHERE key IN ('meilisearch_last_sync','meilisearch_url')")
    .all<{ key: string; value: string }>();
  const values: Record<string, string> = {};
  for (const row of config.results || []) values[row.key] = row.value;
  return c.json({ code: 0, data: { ...stats, configured: Boolean(values.meilisearch_url), last_sync: Number(values.meilisearch_last_sync || 0) } });
});

cloudAdminRouter.post('/search/sync', async (c) => {
  try {
    const result = await SearchService.rebuild(c.env.DB);
    return c.json({ code: 0, msg: `搜索索引同步完成，共写入 ${result.indexed} 条内容（${result.models} 个模型）`, data: result });
  } catch (error) {
    return c.json({ code: 400, msg: error instanceof Error ? error.message : '搜索索引同步失败' }, 400);
  }
});

cloudAdminRouter.get('/push/status', async (c) => {
  const [key, counts] = await Promise.all([
    WebPushService.publicKey(c.env.DB),
    c.env.DB.prepare('SELECT COUNT(*) AS subscriptions,COUNT(DISTINCT user_id) AS members FROM web_push_subscription')
      .first<{ subscriptions: number; members: number }>(),
  ]);
  return c.json({ code: 0, data: { configured: Boolean(key), public_key: key, subscriptions: Number(counts?.subscriptions || 0), members: Number(counts?.members || 0) } });
});

cloudAdminRouter.post('/push/vapid/generate', async (c) => {
  try {
    const result = await WebPushService.generateKeys(c.env.DB);
    return c.json({ code: 0, msg: 'VAPID 密钥已生成；旧推送订阅可能需要用户重新授权', data: result });
  } catch (error) {
    return c.json({ code: 500, msg: error instanceof Error ? error.message : 'VAPID 密钥生成失败' }, 500);
  }
});

cloudAdminRouter.post('/notifications/send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || '').trim().slice(0, 120);
  const message = String(body.body || '').trim().slice(0, 1000);
  const targetUrl = String(body.target_url || '').trim();
  const userId = Math.max(0, Number(body.user_id) || 0);
  if (!title || !message) return c.json({ code: 400, msg: '请填写通知标题和内容' }, 400);
  if (targetUrl && (!targetUrl.startsWith('/') || targetUrl.startsWith('//') || targetUrl.length > 200)) return c.json({ code: 400, msg: '通知链接必须是本站相对路径' }, 400);
  const now = Math.floor(Date.now() / 1000);
  if (userId > 0) {
    const user = await c.env.DB.prepare('SELECT user_id FROM user WHERE user_id=? AND user_status=1').bind(userId).first();
    if (!user) return c.json({ code: 404, msg: '会员不存在或已停用' }, 404);
    await c.env.DB.prepare('INSERT INTO user_notification(user_id,title,body,kind,target_url,created_at) VALUES(?,?,?,\'admin\',?,?)')
      .bind(userId, title, message, targetUrl, now).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO user_notification(user_id,title,body,kind,target_url,created_at)
      SELECT user_id,?,?, 'admin',?,? FROM user WHERE user_status=1`).bind(title, message, targetUrl, now).run();
  }
  const push = await WebPushService.send(c.env.DB, { title, body: message, url: targetUrl || '/' }, userId);
  return c.json({ code: 0, msg: userId ? '会员通知已发送' : '全站通知已发送', data: { push } });
});

cloudAdminRouter.get('/monitor', async (c) => {
  const tableNames = ['vod','art','topic','manga','actor','role','website','user','site_page','site_host_config','collect_node','comment','gbook','live_channel','media_asset','telegram_storage_account','user_invite_code','user_invite_reward','user_wallet','cash_withdrawal','user_post','user_post_like','user_post_comment','user_post_report','user_post_attachment','role_vote','role_score_vote','user_notification','payment_intent','playback_trial_session','content_translation','resource_check_item'];
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
  const query = c.req.query();
  const conditions: string[] = [];
  const params: string[] = [];
  const keyword = String(query.wd || '').trim().slice(0, 120);
  const provider = String(query.provider || '').trim();
  if (keyword) { conditions.push('(file_name LIKE ? OR public_url LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (['r2','telegraph','telegram'].includes(provider)) { conditions.push('storage_provider=?'); params.push(provider); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM media_asset ${where}`).bind(...params).first<{ c: number }>();
  const rows = await c.env.DB.prepare(`SELECT * FROM media_asset ${where} ORDER BY media_id DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();
  const count = total?.c || 0;
  const storage = await loadMediaStorageConfig(c.env.DB);
  const telegramReady = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM telegram_storage_account WHERE enabled=1 AND bot_token<>'' AND chat_id<>''").first<{ c: number }>();
  return c.json({ code: 0, data: { page, limit, total: count, pagecount: Math.max(1, Math.ceil(count / limit)), list: rows.results || [], bucket_ready: !!c.env.MEDIA_BUCKET, telegraph_ready: !!storage.telegraphUrl, storage_provider: storage.provider, telegram_accounts_ready: telegramReady?.c || 0 } });
});

cloudAdminRouter.post('/media/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? Array.from(new Set<number>((body.ids as unknown[]).map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 100) : [];
  if (!ids.length) return c.json({ code: 400, msg: '请先选择媒体文件' }, 400);
  const settings = await loadMediaStorageConfig(c.env.DB);
  const deleted: number[] = [];
  const skipped: Array<{ media_id: number; reason: string }> = [];
  for (const id of ids) {
    const media = await c.env.DB.prepare('SELECT object_key,public_url,storage_provider FROM media_asset WHERE media_id=?')
      .bind(id).first<{ object_key: string; public_url: string; storage_provider: string }>();
    if (!media) { skipped.push({ media_id: id, reason: '文件不存在' }); continue; }
    const referenced = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM media_sync_item WHERE status='done' AND target_url=?")
      .bind(media.public_url).first<{ c: number }>();
    if ((referenced?.c || 0) > 0) { skipped.push({ media_id: id, reason: '仍被内容引用，请先恢复原图' }); continue; }
    const postReferences = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM user_post_attachment WHERE media_id=?').bind(id).first<{ c: number }>();
    if ((postReferences?.c || 0) > 0) { skipped.push({ media_id: id, reason: '仍被会员动态引用，暂不能删除' }); continue; }
    const imageRefs = await Promise.all(IMAGE_SOURCES.map(async (source) => {
      const expression = source.fields.map((field) => `CASE WHEN instr(COALESCE(${field},''),?)>0 THEN 1 ELSE 0 END`).join('+');
      const ref = await c.env.DB.prepare(`SELECT COALESCE(SUM(${expression}),0) AS c FROM ${source.table}`).bind(...source.fields.map(() => media.public_url)).first<{ c: number }>();
      return Number(ref?.c || 0);
    }));
    if (imageRefs.some((count) => count > 0)) { skipped.push({ media_id: id, reason: '仍被内容图片字段引用，请先替换图片地址' }); continue; }
    if (await memberAvatarReferenceCount(c.env.DB, media.public_url)) { skipped.push({ media_id: id, reason: '仍作为会员头像使用，请先更换头像' }); continue; }
    try {
      if (media.storage_provider === 'telegraph') await deleteFromTelegraph(settings, media.public_url);
      else if (media.storage_provider === 'r2') {
        if (!c.env.MEDIA_BUCKET) throw new Error('R2 媒体桶未绑定');
        await c.env.MEDIA_BUCKET.delete(media.object_key);
      }
      await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id=?').bind(id).run();
      deleted.push(id);
    } catch (error) { skipped.push({ media_id: id, reason: error instanceof Error ? error.message : '删除失败' }); }
  }
  return c.json({ code: 0, msg: `已删除 ${deleted.length} 个附件${skipped.length ? `，${skipped.length} 个未删除` : ''}`, data: { deleted, skipped } });
});

cloudAdminRouter.get('/media/telegram/accounts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT account_id,account_name,chat_id,weight,enabled,upload_count,failure_count,last_used_at,last_error,
    CASE WHEN bot_token<>'' THEN 1 ELSE 0 END AS token_set,created_at,updated_at FROM telegram_storage_account ORDER BY account_id DESC`).all();
  const accounts = rows.results || [];
  return c.json({ code: 0, data: { accounts, total: accounts.length, enabled: accounts.filter((row: any) => Number(row.enabled) === 1).length,
    total_weight: accounts.reduce((sum: number, row: any) => sum + (Number(row.enabled) === 1 ? Math.max(1, Number(row.weight) || 1) : 0), 0) } });
});

cloudAdminRouter.post('/media/telegram/accounts/save', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Math.max(0, Number(body.account_id) || 0);
  const name = String(body.account_name || '').trim().slice(0, 80);
  const rawChatId = String(body.chat_id || '').trim().slice(0, 128);
  const chatId = rawChatId.startsWith('@') ? rawChatId.toLowerCase() : rawChatId;
  const providedToken = String(body.bot_token || '').trim();
  const weight = Math.min(100, Math.max(1, Number.parseInt(String(body.weight || '1'), 10) || 1));
  const enabled = Number(body.enabled) === 0 ? 0 : 1;
  if (!name || !/^(-?\d{1,32}|@[a-z0-9_]{5,32})$/i.test(chatId)) return c.json({ code: 400, msg: '请填写名称和有效的频道/群组 ID（数字 ID 或 @频道用户名）' }, 400);
  if (providedToken && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(providedToken)) return c.json({ code: 400, msg: 'Bot Token 格式无效' }, 400);
  let token = providedToken;
  if (id && !token) {
    const existing = await c.env.DB.prepare('SELECT bot_token FROM telegram_storage_account WHERE account_id=?').bind(id).first<{ bot_token: string }>();
    if (!existing) return c.json({ code: 404, msg: 'TG Bot 账户不存在' }, 404);
    token = existing.bot_token;
  } else if (id && token) {
    const existing = await c.env.DB.prepare('SELECT bot_token FROM telegram_storage_account WHERE account_id=?').bind(id).first<{ bot_token: string }>();
    if (!existing) return c.json({ code: 404, msg: 'TG Bot 账户不存在' }, 404);
    if (existing.bot_token !== token) {
      const references = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM media_asset WHERE storage_provider='telegram' AND provider_ref LIKE ?`)
        .bind(`${id}:%`).first<{ c: number }>();
      if ((references?.c || 0) > 0) return c.json({ code: 409, msg: '该 Bot 已存有附件，不能直接更换 Token；请新增账户并停用旧账户' }, 409);
    }
  }
  if (!token) return c.json({ code: 400, msg: '请填写 Bot Token' }, 400);
  const duplicateTarget = await c.env.DB.prepare(`SELECT account_id FROM telegram_storage_account
    WHERE bot_token=? AND chat_id=? AND account_id<>? LIMIT 1`).bind(token, chatId, id).first<{ account_id: number }>();
  if (duplicateTarget) return c.json({ code: 409, msg: '这个 Bot 已绑定该频道/群组，请编辑已有投递目标' }, 409);
  if (!id) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM telegram_storage_account').first<{ c: number }>();
    if ((count?.c || 0) >= 20) return c.json({ code: 400, msg: '最多管理 20 个 TG Bot 账户' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    if (id) await c.env.DB.prepare(`UPDATE telegram_storage_account SET account_name=?,bot_token=?,chat_id=?,weight=?,enabled=?,updated_at=? WHERE account_id=?`)
      .bind(name, token, chatId, weight, enabled, now, id).run();
    else await c.env.DB.prepare(`INSERT INTO telegram_storage_account (account_name,bot_token,chat_id,weight,enabled,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).bind(name, token, chatId, weight, enabled, now, now).run();
  } catch (error) {
    return c.json({ code: 409, msg: error instanceof Error && /unique/i.test(error.message) ? '这个 Bot 与频道/群组的组合已经添加过了' : '保存 TG Bot 账户失败' }, 409);
  }
  return c.json({ code: 0, msg: id ? 'TG Bot 账户已更新' : 'TG Bot 账户已添加' });
});

cloudAdminRouter.post('/media/telegram/accounts/:id/test', async (c) => {
  const id = Number(c.req.param('id'));
  const account = await c.env.DB.prepare('SELECT account_name,bot_token,chat_id FROM telegram_storage_account WHERE account_id=?').bind(id)
    .first<{ account_name: string; bot_token: string; chat_id: string }>();
  if (!account) return c.json({ code: 404, msg: 'TG Bot 账户不存在' }, 404);
  const settings = await loadMediaStorageConfig(c.env.DB);
  try {
    const apiBase = new URL(settings.tgApiBase);
    if (apiBase.protocol !== 'https:') throw new Error('Telegram Bot API 地址必须是 HTTPS');
    apiBase.pathname = apiBase.pathname.replace(/\/+$/, '');
    const checkUrl = new URL(`${apiBase.pathname}/bot${account.bot_token}/getChat?chat_id=${encodeURIComponent(account.chat_id)}`, apiBase.origin);
    const response = await fetch(checkUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { title?: string; username?: string } };
    if (!response.ok || !result.ok) throw new Error(result.description || `Telegram API 返回 HTTP ${response.status}`);
    await c.env.DB.prepare(`UPDATE telegram_storage_account SET last_error='',updated_at=? WHERE account_id=?`).bind(Math.floor(Date.now() / 1000), id).run();
    return c.json({ code: 0, msg: `${account.account_name} 连接正常：${result.result?.title || result.result?.username || account.chat_id}` });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 400) : '连接失败';
    await c.env.DB.prepare(`UPDATE telegram_storage_account SET last_error=?,updated_at=? WHERE account_id=?`).bind(message, Math.floor(Date.now() / 1000), id).run();
    return c.json({ code: 502, msg: `${account.account_name}：${message}` }, 502);
  }
});

cloudAdminRouter.delete('/media/telegram/accounts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const referenced = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM media_asset WHERE storage_provider='telegram' AND provider_ref LIKE ?`)
    .bind(`${id}:%`).first<{ c: number }>();
  if ((referenced?.c || 0) > 0) return c.json({ code: 409, msg: '这个账户仍提供已有图片，请先停用它；删除 Bot 会使历史文件无法回源' }, 409);
  await c.env.DB.prepare('DELETE FROM telegram_storage_account WHERE account_id=?').bind(id).run();
  return c.json({ code: 0, msg: 'TG Bot 账户已删除' });
});

cloudAdminRouter.post('/media/storage/test', async (c) => {
  const settings = await loadMediaStorageConfig(c.env.DB);
  try {
    if (settings.provider === 'r2') {
      return c.env.MEDIA_BUCKET ? c.json({ code: 0, msg: 'R2 媒体桶已绑定' }) : c.json({ code: 503, msg: '当前选择 R2，但未绑定 MEDIA_BUCKET' }, 503);
    }
    if (settings.provider === 'telegram') {
      const apiBase = new URL(settings.tgApiBase);
      if (apiBase.protocol !== 'https:') throw new Error('Telegram Bot API 地址必须是 HTTPS');
      apiBase.pathname = apiBase.pathname.replace(/\/+$/, '');
      const rows = await c.env.DB.prepare(`SELECT account_id,account_name,bot_token,chat_id FROM telegram_storage_account WHERE enabled=1 ORDER BY account_id`)
        .all<{ account_id: number; account_name: string; bot_token: string; chat_id: string }>();
      const pool = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM telegram_storage_account').first<{ c: number }>();
      const accounts = rows.results?.length ? rows.results : !(pool?.c || 0) && settings.tgBotToken && settings.tgChatId
        ? [{ account_id: 0, account_name: '默认 TG Bot', bot_token: settings.tgBotToken, chat_id: settings.tgChatId }]
        : [];
      if (!accounts.length) throw new Error('账户池没有已启用的 Bot，请在媒体库添加账户');
      const results = await Promise.all(accounts.map(async (account) => {
        try {
          const checkUrl = new URL(`${apiBase.pathname}/bot${account.bot_token}/getChat?chat_id=${encodeURIComponent(account.chat_id)}`, apiBase.origin);
          const response = await fetch(checkUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000) });
          const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { title?: string; username?: string } };
          if (!response.ok || !result.ok) throw new Error(result.description || `HTTP ${response.status}`);
          if (account.account_id) await c.env.DB.prepare(`UPDATE telegram_storage_account SET last_error='',updated_at=? WHERE account_id=?`)
            .bind(Math.floor(Date.now() / 1000), account.account_id).run();
          return { ok: true, name: account.account_name, target: result.result?.title || result.result?.username || account.chat_id };
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 300) : '连接失败';
          if (account.account_id) await c.env.DB.prepare(`UPDATE telegram_storage_account SET last_error=?,updated_at=? WHERE account_id=?`)
            .bind(message, Math.floor(Date.now() / 1000), account.account_id).run().catch(() => {});
          return { ok: false, name: account.account_name, target: message };
        }
      }));
      const healthy = results.filter((item) => item.ok).length;
      if (!healthy) return c.json({ code: 502, msg: 'TG Bot 账户全部连接失败：' + results.map((item) => `${item.name}：${item.target}`).join('；') }, 502);
      const failures = results.filter((item) => !item.ok).map((item) => `${item.name}：${item.target}`);
      return c.json({ code: 0, msg: `TG Bot 可用 ${healthy}/${results.length} 个账户${failures.length ? '；异常：' + failures.join('；') : ''}` });
    }
    if (!settings.username || !settings.password) throw new Error('请先填写 Telegraph 部署时设置的 USERNAME 和 PASSWORD');
    const base = telegraphBase(settings);
    const headers = new Headers();
    if (settings.username && settings.password) headers.set('Authorization', basicAuthorization(settings.username, settings.password));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try { response = await fetch(base, { method: 'GET', headers, redirect: 'manual', signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) return c.json({ code: 502, msg: '服务已连接，但认证失败；核对 USERNAME、PASSWORD 和 ENABLE_AUTH' }, 502);
    if (!response.ok) return c.json({ code: 502, msg: `服务有响应，但首页返回 HTTP ${response.status}；检查服务域名或反向代理路径` }, 502);
    return c.json({ code: 0, msg: 'Telegraph 服务连接正常' });
  } catch (error) { return c.json({ code: 502, msg: error instanceof Error ? error.message : '连接 Telegraph 服务失败' }, 502); }
});

cloudAdminRouter.post('/media', async (c) => {
  const storage = await loadMediaStorageConfig(c.env.DB);
  const bucket = c.env.MEDIA_BUCKET;
  if (storage.provider === 'r2' && !bucket) return c.json({ code: 503, msg: '当前选择 R2 存储，但尚未绑定 MEDIA_BUCKET' }, 503);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ code: 400, msg: '请选择图片文件' }, 400);
  const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
  if (!allowed.has(file.type)) return c.json({ code: 400, msg: '仅支持 JPEG、PNG、WebP、GIF、AVIF 图片' }, 400);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return c.json({ code: 413, msg: '图片大小须在 10 MB 以内' }, 413);
  const extension = IMAGE_MIME_EXT[file.type] || 'avif';
  let key: string;
  let url: string;
  let providerRef = '';
  if (storage.provider === 'telegraph') {
    try { url = await uploadToTelegraph(storage, file, file.name, file.type); }
    catch (error) { return c.json({ code: 502, msg: error instanceof Error ? error.message : 'Telegraph 上传失败' }, 502); }
    key = `telegraph:${crypto.randomUUID()}`;
  } else if (storage.provider === 'telegram') {
    try {
      const uploaded = await uploadToTelegram(c.env.DB, storage, file, file.name, file.type, new URL(c.req.url).origin);
      key = uploaded.objectKey;
      providerRef = uploaded.providerRef;
      url = uploaded.publicUrl;
    } catch (error) { return c.json({ code: 502, msg: error instanceof Error ? error.message : 'Telegram 上传失败' }, 502); }
  } else {
    key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    await bucket!.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
    url = `${new URL(c.req.url).origin}/media/${key}`;
  }
  const configs = await c.env.DB.prepare("SELECT value FROM config WHERE key='admin_pwd'").first<{ value: string }>();
  const passwordHash = configs?.value || '';
  const secret = c.env.JWT_SECRET || (passwordHash ? `MACCMS_${passwordHash.slice(0, 16)}` : 'MACCMS_CLOUDFLARE_EDGE_SECRET_2026');
  const auth = await AuthUtils.verifyToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, ''), secret);
  const admin = auth.username || 'admin';
  const result = await c.env.DB.prepare(`INSERT INTO media_asset (object_key,storage_provider,provider_ref,file_name,content_type,file_size,public_url,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(key, storage.provider, providerRef, file.name.slice(0, 240), file.type, file.size, url, admin, Math.floor(Date.now() / 1000)).run();
  return c.json({ code: 0, msg: '图片上传成功', data: { media_id: result.meta.last_row_id, object_key: key, public_url: url, storage_provider: storage.provider } });
});

cloudAdminRouter.delete('/media/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const media = await c.env.DB.prepare('SELECT object_key,public_url,storage_provider FROM media_asset WHERE media_id = ?').bind(id).first<{ object_key: string; public_url: string; storage_provider: string }>();
  if (!media) return c.json({ code: 404, msg: '媒体文件不存在' }, 404);
  if (await memberAvatarReferenceCount(c.env.DB, media.public_url)) return c.json({ code: 409, msg: '该附件仍作为会员头像使用，请先更换头像' }, 409);
  const referenced = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM media_sync_item WHERE status='done' AND target_url=?")
    .bind(media.public_url).first<{ c: number }>();
  if ((referenced?.c || 0) > 0) return c.json({ code: 409, msg: '该图片已被内容引用，请先恢复原图或更换引用后再删除' }, 409);
  try { await deleteStoredMedia(media.storage_provider, c.env.MEDIA_BUCKET, await loadMediaStorageConfig(c.env.DB), media.object_key, media.public_url); }
  catch (error) { return c.json({ code: 502, msg: error instanceof Error ? error.message : '附件删除失败' }, 502); }
  await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id = ?').bind(id).run();
  return c.json({ code: 0, msg: '媒体文件已删除' });
});

cloudAdminRouter.get('/media/sync', async (c) => {
  const scan = await c.env.DB.prepare('SELECT * FROM media_sync_scan ORDER BY scan_id DESC LIMIT 1').first<any>();
  if (!scan) return c.json({ code: 0, data: { scan: null, counts: { pending: 0, done: 0, failed: 0, skipped: 0 }, list: [] } });
  const counts = await c.env.DB.prepare(`SELECT status,COUNT(*) AS c FROM media_sync_item WHERE scan_id=? GROUP BY status`)
    .bind(scan.scan_id).all<{ status: string; c: number }>();
  const list = await c.env.DB.prepare(`SELECT * FROM media_sync_item WHERE scan_id=? ORDER BY item_id DESC LIMIT 50`)
    .bind(scan.scan_id).all();
  const summary = { pending: 0, done: 0, failed: 0, skipped: 0 };
  for (const row of counts.results || []) if (row.status in summary) summary[row.status as keyof typeof summary] = Number(row.c);
  return c.json({ code: 0, data: { scan, counts: summary, list: list.results || [] } });
});

cloudAdminRouter.post('/media/sync/scan', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(`INSERT INTO media_sync_scan (state,model_index,last_id,scanned_rows,found_count,created_at,updated_at)
    VALUES ('running',0,0,0,0,?,?)`).bind(now, now).run();
  return c.json({ code: 0, msg: '已创建图片外链扫描任务', data: { scan_id: result.meta.last_row_id } });
});

cloudAdminRouter.post('/media/sync/scan/:id/continue', async (c) => {
  const scanId = Number(c.req.param('id'));
  const scan = await c.env.DB.prepare('SELECT * FROM media_sync_scan WHERE scan_id=?').bind(scanId).first<any>();
  if (!scan) return c.json({ code: 404, msg: '扫描任务不存在' }, 404);
  if (scan.state !== 'running') return c.json({ code: 0, data: { scan, complete: true } });
  const batchSize = 200;
  let modelIndex = Number(scan.model_index);
  let lastId = Number(scan.last_id);
  let scannedRows = 0;
  let foundCount = 0;
  let advances = 0;
  while (modelIndex < IMAGE_SOURCES.length && advances < IMAGE_SOURCES.length) {
    const source = IMAGE_SOURCES[modelIndex];
    const columns = [source.id, source.name, ...source.fields].join(',');
    const rows = await c.env.DB.prepare(`SELECT ${columns} FROM ${source.table} WHERE ${source.id}>? ORDER BY ${source.id} ASC LIMIT ?`)
      .bind(lastId, batchSize).all<Record<string, unknown>>();
    const records = rows.results || [];
    if (!records.length) {
      modelIndex += 1;
      lastId = 0;
      advances += 1;
      continue;
    }
    lastId = Number(records[records.length - 1][source.id]);
    scannedRows += records.length;
    const inserts: D1PreparedStatement[] = [];
    for (const record of records) {
      const recordId = Number(record[source.id]);
      const recordName = String(record[source.name] || '').slice(0, 500);
      for (const field of source.fields) {
        const raw = String(record[field] || '');
        const urls = Array.from(raw.matchAll(IMAGE_URL_RE), (match) => match[0].replace(/[),.;，。；]+$/g, ''))
          .filter((url) => isPublicImageUrl(url) && !url.includes('/media/'));
        const uniqueUrls = Array.from(new Set(urls));
        for (const url of uniqueUrls) {
          inserts.push(c.env.DB.prepare(`INSERT OR IGNORE INTO media_sync_item
            (scan_id,model,record_id,record_name,field_name,source_url,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,'pending',?,?)`).bind(scanId, source.model, recordId, recordName, field, url, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)));
        }
      }
    }
    for (let offset = 0; offset < inserts.length; offset += 80) {
      const result = await c.env.DB.batch(inserts.slice(offset, offset + 80));
      foundCount += result.reduce((sum, item) => sum + Number(item.meta.changes || 0), 0);
    }
    if (records.length < batchSize) { modelIndex += 1; lastId = 0; }
    break;
  }
  const state = modelIndex >= IMAGE_SOURCES.length ? 'done' : 'running';
  await c.env.DB.prepare(`UPDATE media_sync_scan SET state=?,model_index=?,last_id=?,scanned_rows=scanned_rows+?,found_count=found_count+?,updated_at=? WHERE scan_id=?`)
    .bind(state, modelIndex, lastId, scannedRows, foundCount, Math.floor(Date.now() / 1000), scanId).run();
  const updated = await c.env.DB.prepare('SELECT * FROM media_sync_scan WHERE scan_id=?').bind(scanId).first<any>();
  return c.json({ code: 0, data: { scan: updated, complete: state === 'done', batch_rows: scannedRows, batch_found: foundCount } });
});

cloudAdminRouter.post('/media/sync/process', async (c) => {
  const storage = await loadMediaStorageConfig(c.env.DB);
  const bucket = c.env.MEDIA_BUCKET;
  if (storage.provider === 'r2' && !bucket) return c.json({ code: 503, msg: '当前选择 R2 存储，但尚未绑定 MEDIA_BUCKET' }, 503);
  const latest = await c.env.DB.prepare('SELECT scan_id FROM media_sync_scan ORDER BY scan_id DESC LIMIT 1').first<{ scan_id: number }>();
  if (!latest) return c.json({ code: 400, msg: '请先扫描图片外链' }, 400);
  const workLimit = storage.provider === 'r2' ? 3 : 1;
  const work = await c.env.DB.prepare(`SELECT * FROM media_sync_item WHERE scan_id=? AND status='pending' ORDER BY item_id ASC LIMIT ?`)
    .bind(latest.scan_id, workLimit).all<any>();
  let done = 0;
  let failed = 0;
  for (const item of work.results || []) {
    const source = IMAGE_SOURCES.find((entry) => entry.model === item.model);
    const url = isPublicImageUrl(String(item.source_url));
    if (!source || !source.fields.includes(item.field_name) || !url) {
      await c.env.DB.prepare(`UPDATE media_sync_item SET status='failed',attempts=attempts+1,error_text=?,updated_at=? WHERE item_id=?`)
        .bind('不支持的图片字段或不安全的图片地址', Math.floor(Date.now() / 1000), item.item_id).run();
      failed += 1;
      continue;
    }
    let key = '';
    let targetUrl = '';
    let providerRef = '';
    let assetId = 0;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      let response: Response;
      try { response = await fetch(url.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' } }); }
      finally { clearTimeout(timeout); }
      if (response.status >= 300 && response.status < 400) throw new Error('图片源返回跳转，为保护站点安全已拒绝');
      if (!response.ok) throw new Error(`图片源响应 HTTP ${response.status}`);
      const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const extension = IMAGE_MIME_EXT[contentType];
      if (!extension) throw new Error('远端文件不是支持的图片格式');
      const bytes = await readImageBody(response);
      if (!bytes.length) throw new Error('远端图片为空');
      const fileName = url.pathname.split('/').pop()?.slice(0, 240) || `${item.model}-${item.record_id}.${extension}`;
      if (storage.provider === 'telegraph') {
        targetUrl = await uploadToTelegraph(storage, new Blob([bytes], { type: contentType }), fileName, contentType);
        key = `telegraph:${crypto.randomUUID()}`;
      } else if (storage.provider === 'telegram') {
        const uploaded = await uploadToTelegram(c.env.DB, storage, new Blob([bytes], { type: contentType }), fileName, contentType, new URL(c.req.url).origin);
        key = uploaded.objectKey;
        providerRef = uploaded.providerRef;
        targetUrl = uploaded.publicUrl;
      } else {
        key = `imports/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
        await bucket!.put(key, bytes, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
        targetUrl = `${new URL(c.req.url).origin}/media/${key}`;
      }
      const current = await c.env.DB.prepare(`SELECT ${source.id} AS record_id,${item.field_name} AS field_value FROM ${source.table} WHERE ${source.id}=?`)
        .bind(item.record_id).first<{ record_id: number; field_value: string }>();
      const original = String(current?.field_value || '');
      if (!current || !original.includes(item.source_url)) {
        await deleteStoredMedia(storage.provider, bucket, storage, key, targetUrl).catch(() => {});
        key = '';
        await c.env.DB.prepare(`UPDATE media_sync_item SET status='skipped',error_text=?,updated_at=? WHERE item_id=?`)
          .bind('数据库中的原图片地址已变化，已跳过替换', Math.floor(Date.now() / 1000), item.item_id).run();
        continue;
      }
      const replacement = original.split(String(item.source_url)).join(targetUrl);
      const asset = await c.env.DB.prepare(`INSERT INTO media_asset (object_key,storage_provider,provider_ref,file_name,content_type,file_size,public_url,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(key, storage.provider, providerRef, fileName, contentType, bytes.byteLength, targetUrl, 'remote-sync', Math.floor(Date.now() / 1000)).run();
      assetId = Number(asset.meta.last_row_id || 0);
      const update = await c.env.DB.prepare(`UPDATE ${source.table} SET ${item.field_name}=? WHERE ${source.id}=? AND ${item.field_name}=?`)
        .bind(replacement, item.record_id, original).run();
      if (Number(update.meta.changes || 0) !== 1) {
        await deleteStoredMedia(storage.provider, bucket, storage, key, targetUrl).catch(() => {});
        await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id=?').bind(assetId).run();
        key = '';
        await c.env.DB.prepare(`UPDATE media_sync_item SET status='skipped',error_text=?,updated_at=? WHERE item_id=?`)
          .bind('替换前内容已变化，已跳过', Math.floor(Date.now() / 1000), item.item_id).run();
        continue;
      }
      key = '';
      await c.env.DB.prepare(`UPDATE media_sync_item SET status='done',target_url=?,attempts=attempts+1,error_text='',updated_at=? WHERE item_id=?`)
        .bind(targetUrl, Math.floor(Date.now() / 1000), item.item_id).run();
      done += 1;
    } catch (error) {
      if (key) {
        await deleteStoredMedia(storage.provider, bucket, storage, key, targetUrl).catch(() => {});
        if (assetId) await c.env.DB.prepare('DELETE FROM media_asset WHERE media_id=?').bind(assetId).run().catch(() => {});
      }
      const message = error instanceof Error ? error.message.slice(0, 500) : '图片同步失败';
      await c.env.DB.prepare(`UPDATE media_sync_item SET status='failed',attempts=attempts+1,error_text=?,updated_at=? WHERE item_id=?`)
        .bind(message, Math.floor(Date.now() / 1000), item.item_id).run();
      failed += 1;
    }
  }
  const counts = await c.env.DB.prepare(`SELECT status,COUNT(*) AS c FROM media_sync_item WHERE scan_id=? GROUP BY status`)
    .bind(latest.scan_id).all<{ status: string; c: number }>();
  return c.json({ code: 0, data: { processed: (work.results || []).length, done, failed, counts: counts.results || [] } });
});

cloudAdminRouter.post('/media/sync/retry', async (c) => {
  const latest = await c.env.DB.prepare('SELECT scan_id FROM media_sync_scan ORDER BY scan_id DESC LIMIT 1').first<{ scan_id: number }>();
  if (!latest) return c.json({ code: 400, msg: '没有可重试的扫描任务' }, 400);
  const result = await c.env.DB.prepare(`UPDATE media_sync_item SET status='pending',error_text='',updated_at=? WHERE scan_id=? AND status='failed'`)
    .bind(Math.floor(Date.now() / 1000), latest.scan_id).run();
  return c.json({ code: 0, msg: `已将 ${result.meta.changes || 0} 条失败记录放回同步队列` });
});

cloudAdminRouter.post('/media/sync/:id/restore', async (c) => {
  const itemId = Number(c.req.param('id'));
  const item = await c.env.DB.prepare('SELECT * FROM media_sync_item WHERE item_id=? AND status=\'done\'').bind(itemId).first<any>();
  if (!item) return c.json({ code: 404, msg: '找不到可恢复的图片替换记录' }, 404);
  const source = IMAGE_SOURCES.find((entry) => entry.model === item.model);
  if (!source || !source.fields.includes(item.field_name)) return c.json({ code: 400, msg: '图片字段不支持恢复' }, 400);
  const current = await c.env.DB.prepare(`SELECT ${item.field_name} AS field_value FROM ${source.table} WHERE ${source.id}=?`)
    .bind(item.record_id).first<{ field_value: string }>();
  const value = String(current?.field_value || '');
  if (!current || !value.includes(item.target_url)) return c.json({ code: 409, msg: '当前内容已修改，未覆盖当前图片；请先检查内容' }, 409);
  const restored = value.split(item.target_url).join(item.source_url);
  await c.env.DB.prepare(`UPDATE ${source.table} SET ${item.field_name}=? WHERE ${source.id}=? AND ${item.field_name}=?`)
    .bind(restored, item.record_id, value).run();
  await c.env.DB.prepare(`UPDATE media_sync_item SET status='restored',updated_at=? WHERE item_id=?`)
    .bind(Math.floor(Date.now() / 1000), itemId).run();
  return c.json({ code: 0, msg: '已恢复原图片引用；R2 文件仍保留在媒体库中' });
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
