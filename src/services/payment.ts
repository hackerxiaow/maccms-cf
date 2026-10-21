import type { Bindings } from '../types/index.ts';

type PaymentPlan = { code: string; name: string; type: 'points' | 'vip'; amount_cents: number; points?: number; vip_days?: number; enabled?: boolean };
type PaymentCallback = { order_code: string; amount_cents: number; merchant_id: string; provider_event_id: string; status: string; timestamp: number; sign: string; provider_ref?: string };
type PaymentSettings = Record<string, string>;

async function readSettings(db: D1Database): Promise<PaymentSettings> {
  const rows = await db.prepare(`SELECT key,value FROM config WHERE key IN
    ('payment_provider','payment_checkout_url','payment_query_url','payment_merchant_id','payment_secret','payment_currency','payment_products','payment_epay_type','site_url','site_name')`)
    .all<{ key: string; value: string }>();
  const settings: PaymentSettings = {};
  for (const row of rows.results || []) settings[row.key] = row.value;
  return settings;
}

function getPlans(settings: PaymentSettings): PaymentPlan[] {
  let parsed: unknown;
  try { parsed = JSON.parse(settings.payment_products || '[]'); } catch { throw new Error('在线支付套餐配置不是有效 JSON'); }
  if (!Array.isArray(parsed)) throw new Error('在线支付套餐必须是 JSON 数组');
  return parsed.filter((item): item is PaymentPlan => !!item && typeof item === 'object' && (item as PaymentPlan).enabled !== false)
    .map((item: any) => ({
      code: String(item.code || '').trim(), name: String(item.name || '').trim(), type: item.type,
      amount_cents: Number(item.amount_cents), points: Number(item.points || 0), vip_days: Number(item.vip_days || 0),
    }))
    .filter((plan) => /^[a-zA-Z0-9_-]{1,48}$/.test(plan.code) && plan.name.length > 0
      && ['points', 'vip'].includes(plan.type) && Number.isInteger(plan.amount_cents) && plan.amount_cents > 0
      && plan.amount_cents <= 100000000 && (plan.type === 'points' ? Number.isInteger(plan.points) && plan.points > 0 : Number.isInteger(plan.vip_days) && plan.vip_days > 0));
}

function canonical(fields: Record<string, string | number>): string {
  return Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${String(value)}`).join('&');
}

// Epay V1 requires MD5, which is not part of the Web Crypto digest algorithms.
function md5(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bitLength = input.length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  const shifts = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const sum = (a + f + constants[i] + words[g]) >>> 0;
      const rotated = ((sum << shifts[i]) | (sum >>> (32 - shifts[i]))) >>> 0;
      a = d; d = c; c = b; b = (b + rotated) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0,b0,c0,d0].map((word) => [0,8,16,24].map((shift) => ((word >>> shift) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return Array.from(signed).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function epayFields(input: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'sign' || key === 'sign_type' || value === null || value === undefined || String(value) === '') continue;
    result[key] = String(value);
  }
  return result;
}

function moneyToCents(money: unknown): number {
  const value = String(money ?? '').trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function gatewayUrl(settings: PaymentSettings): URL {
  const value = String(settings.payment_checkout_url || '').trim();
  if (!value) throw new Error('请在系统设置中填写易支付网关地址');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('易支付网关地址格式无效'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('易支付网关必须使用 HTTPS，且不能包含账号密码');
  return url;
}

async function makeCheckout(settings: PaymentSettings, input: { orderCode: string; amountCents: number; title: string; origin: string }): Promise<string> {
  const merchantId = String(settings.payment_merchant_id || '').trim();
  const secret = String(settings.payment_secret || '');
  if (!merchantId || !secret) throw new Error('易支付商户 PID 和密钥尚未配置');
  const returnUrl = new URL(`/user.html?payment=return&order=${encodeURIComponent(input.orderCode)}`, settings.site_url || input.origin).toString();
  const notifyUrl = new URL('/api/payment/notify', settings.site_url || input.origin).toString();
  if ((settings.payment_provider || 'generic') === 'epay') {
    const fields: Record<string, string> = {
      pid: merchantId,
      out_trade_no: input.orderCode,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: input.title.slice(0, 80),
      money: `${Math.floor(input.amountCents / 100)}.${String(input.amountCents % 100).padStart(2, '0')}`,
      sitename: String(settings.site_name || 'MacCMS').slice(0, 80),
      sign_type: 'MD5',
    };
    if (settings.payment_epay_type) fields.type = settings.payment_epay_type;
    fields.sign = md5(`${canonical(epayFields(fields))}${secret}`);
    const checkout = gatewayUrl(settings);
    for (const [key, value] of Object.entries(fields)) checkout.searchParams.set(key, value);
    return checkout.toString();
  }
  const fields = {
    amount_cents: input.amountCents, currency: String(settings.payment_currency || 'CNY'), merchant_id: merchantId,
    notify_url: notifyUrl, order_code: input.orderCode, return_url: returnUrl, timestamp: Math.floor(Date.now() / 1000), title: input.title,
  };
  const checkout = gatewayUrl(settings);
  for (const [key, value] of Object.entries(fields)) checkout.searchParams.set(key, String(value));
  checkout.searchParams.set('sign', await hmacHex(secret, canonical(fields)));
  return checkout.toString();
}

async function settleVerified(env: Bindings, input: { orderCode: string; amountCents: number; eventId: string; providerRef?: string; payloadHash: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payment = await env.DB.prepare(`SELECT payment_id,user_id,product_type,points,vip_days,status,mall_order_id
    FROM payment_intent WHERE order_code=? AND amount_cents=? LIMIT 1`).bind(input.orderCode, input.amountCents)
    .first<{ payment_id: number; user_id: number; product_type: string; points: number; vip_days: number; status: string; mall_order_id: number }>();
  if (!payment) throw new Error('订单不存在或金额不匹配');
  if (payment.status === 'paid') return { already_paid: true };
  if (payment.status !== 'pending') throw new Error('订单已取消或已退款');
  if (payment.product_type === 'mall') {
    const mall = await env.DB.prepare('SELECT status FROM mall_order WHERE mall_order_id=? AND user_id=?')
      .bind(payment.mall_order_id, payment.user_id).first<{ status: number }>();
    if (!mall || Number(mall.status) !== 0) throw new Error('商城订单已取消或状态已变化，请联系管理员处理支付');
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO payment_event(provider_event_id,order_code,payload_hash,received_at) VALUES(?,?,?,?)`)
      .bind(input.eventId, input.orderCode, input.payloadHash, now),
    env.DB.prepare(`UPDATE payment_intent SET status='paid',provider_ref=?,paid_at=?
      WHERE order_code=? AND amount_cents=? AND status='pending' AND changes()=1`)
      .bind(String(input.providerRef || input.eventId).slice(0, 200), now, input.orderCode, input.amountCents),
    // Claim entitlement/fulfillment exactly once immediately after the pending -> paid transition.
    // Later branch-specific UPDATEs must not depend on SQLite changes() from a different branch.
    env.DB.prepare(`UPDATE payment_intent SET settled_at=? WHERE order_code=? AND status='paid' AND settled_at=0 AND changes()=1`)
      .bind(now, input.orderCode),
    env.DB.prepare(`UPDATE "order" SET order_status=1,order_pay_type='hosted' WHERE order_code=?
      AND EXISTS(SELECT 1 FROM payment_intent WHERE order_code=? AND status='paid' AND settled_at=? AND product_type<>'mall')`)
      .bind(input.orderCode, input.orderCode, now),
    env.DB.prepare(`UPDATE user SET
      user_points=user_points+(SELECT points FROM payment_intent WHERE order_code=?),
      group_id=CASE WHEN (SELECT vip_days FROM payment_intent WHERE order_code=?)>0 THEN 2 ELSE group_id END,
      user_end_time=CASE WHEN (SELECT vip_days FROM payment_intent WHERE order_code=?)>0
        THEN MAX(user_end_time,?)+(SELECT vip_days FROM payment_intent WHERE order_code=?)*86400 ELSE user_end_time END
      WHERE user_id=? AND EXISTS(SELECT 1 FROM payment_intent WHERE order_code=? AND status='paid' AND settled_at=? AND product_type IN ('points','vip'))`)
      .bind(input.orderCode, input.orderCode, input.orderCode, now, input.orderCode, payment.user_id, input.orderCode, now),
    env.DB.prepare(`UPDATE mall_order SET status=1,updated_at=? WHERE mall_order_id=? AND status=0
      AND EXISTS(SELECT 1 FROM payment_intent WHERE order_code=? AND status='paid' AND settled_at=? AND product_type='mall')`)
      .bind(now, payment.mall_order_id, input.orderCode, now),
    env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
      SELECT user_id,'payment',amount_cents/100,points,1,'在线支付入账',?,? FROM payment_intent WHERE order_code=? AND product_type IN ('points','vip') AND status='paid' AND settled_at=?`)
      .bind(String(input.providerRef || 'payment-gateway').slice(0, 100), now, input.orderCode, now),
    env.DB.prepare(`INSERT INTO user_notification(user_id,title,body,kind,created_at)
      SELECT user_id,'支付成功','订单 '+order_code+' 已完成', 'payment',? FROM payment_intent WHERE order_code=? AND status='paid' AND settled_at=?`)
      .bind(now, input.orderCode, now),
  ]);
  const [updated, committedEvent] = await Promise.all([
    env.DB.prepare('SELECT status FROM payment_intent WHERE order_code=?').bind(input.orderCode).first<{ status: string }>(),
    env.DB.prepare('SELECT order_code,payload_hash FROM payment_event WHERE provider_event_id=?').bind(input.eventId).first<{ order_code: string; payload_hash: string }>(),
  ]);
  if (committedEvent && (committedEvent.order_code !== input.orderCode || !constantTimeEqual(committedEvent.payload_hash, input.payloadHash))) {
    throw new Error('支付服务商事件 ID 已用于其他通知');
  }
  if (updated?.status !== 'paid') throw new Error('支付通知未完成订单入账，请稍后重试');
  return { already_paid: true };
}

export class PaymentService {
  static async plans(db: D1Database): Promise<PaymentPlan[]> { return getPlans(await readSettings(db)); }

  static async status(db: D1Database) {
    const settings = await readSettings(db);
    return { configured: Boolean(settings.payment_checkout_url && settings.payment_merchant_id && settings.payment_secret), provider: settings.payment_provider || 'generic' };
  }

  static async create(env: Bindings, userId: number, planCode: string, origin: string) {
    const settings = await readSettings(env.DB);
    const plan = getPlans(settings).find((item) => item.code === planCode);
    if (!plan) throw new Error('支付套餐不存在或已停用');
    const user = await env.DB.prepare('SELECT user_name FROM user WHERE user_id=? AND user_status=1').bind(userId).first<{ user_name: string }>();
    if (!user) throw new Error('会员账号不存在或已停用');
    const code = `MC${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const now = Math.floor(Date.now() / 1000), expiresAt = now + 86400;
    const checkoutUrl = await makeCheckout(settings, { orderCode: code, amountCents: plan.amount_cents, title: plan.name, origin });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_intent(order_code,user_id,product_type,product_value,amount_cents,points,vip_days,status,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,'pending',?,?)`).bind(code, userId, plan.type, plan.code, plan.amount_cents, plan.points || 0, plan.vip_days || 0, now, expiresAt),
      env.DB.prepare(`INSERT INTO "order"(order_code,user_id,order_status,order_price,order_time,order_points,order_pay_type)
        VALUES(?,?,0,?,?,?,'hosted')`).bind(code, userId, plan.amount_cents / 100, now, plan.points || 0),
    ]);
    return { order_code: code, amount_cents: plan.amount_cents, checkout_url: checkoutUrl, expires_at: expiresAt };
  }

  static async createMall(env: Bindings, input: { userId: number; orderId: number; orderCode: string; title: string; amountCents: number; origin: string }) {
    const settings = await readSettings(env.DB);
    if (input.amountCents <= 0) throw new Error('商城订单金额无效');
    const now = Math.floor(Date.now() / 1000), expiresAt = now + 86400;
    const checkoutUrl = await makeCheckout(settings, { orderCode: input.orderCode, amountCents: input.amountCents, title: input.title, origin: input.origin });
    await env.DB.prepare(`INSERT OR IGNORE INTO payment_intent(order_code,user_id,product_type,product_value,amount_cents,mall_order_id,status,created_at,expires_at)
      VALUES(?,?, 'mall', ?, ?, ?, 'pending', ?, ?)`)
      .bind(input.orderCode, input.userId, input.orderCode, input.amountCents, input.orderId, now, expiresAt).run();
    const existing = await env.DB.prepare('SELECT status,amount_cents,mall_order_id FROM payment_intent WHERE order_code=? AND user_id=?')
      .bind(input.orderCode, input.userId).first<{ status: string; amount_cents: number; mall_order_id: number }>();
    if (!existing || existing.status !== 'pending' || Number(existing.amount_cents) !== input.amountCents || Number(existing.mall_order_id) !== input.orderId) {
      throw new Error('商城支付订单状态或金额不匹配');
    }
    return { checkout_url: checkoutUrl, expires_at: expiresAt };
  }

  static async processEpayCallback(env: Bindings, input: Record<string, unknown>) {
    const settings = await readSettings(env.DB);
    const secret = settings.payment_secret || '';
    const merchantId = String(settings.payment_merchant_id || '');
    if (!secret || String(input.pid || '') !== merchantId) throw new Error('易支付商户 PID 校验失败');
    if (String(input.sign_type || 'MD5').toUpperCase() !== 'MD5') throw new Error('易支付签名类型无效');
    const sign = String(input.sign || '').toLowerCase();
    const fields = epayFields(input);
    if (!/^[a-f0-9]{32}$/.test(sign) || !constantTimeEqual(md5(`${canonical(fields)}${secret}`), sign)) throw new Error('易支付签名无效');
    const orderCode = String(input.out_trade_no || '').trim();
    const tradeNo = String(input.trade_no || '').trim();
    const amountCents = moneyToCents(input.money);
    if (!orderCode || !tradeNo || !Number.isInteger(amountCents)) throw new Error('易支付通知缺少订单号或有效金额');
    if (String(input.trade_status || '') !== 'TRADE_SUCCESS') return { already_paid: false, pending: true };
    const payloadHash = md5(`${canonical(fields)}${secret}`);
    return settleVerified(env, { orderCode, amountCents, eventId: `epay:${tradeNo}`, providerRef: tradeNo, payloadHash });
  }

  static async processCallback(env: Bindings, input: PaymentCallback) {
    const settings = await readSettings(env.DB);
    const secret = settings.payment_secret || '';
    if (!secret || input.merchant_id !== settings.payment_merchant_id) throw new Error('支付商户校验失败');
    if (input.status !== 'paid' || !input.order_code || !input.provider_event_id || !Number.isInteger(Number(input.amount_cents))) throw new Error('支付通知参数无效');
    const timestamp = Number(input.timestamp), now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 86400) throw new Error('支付通知已过期');
    const fields = { amount_cents: Number(input.amount_cents), merchant_id: input.merchant_id, order_code: input.order_code,
      provider_event_id: input.provider_event_id, status: input.status, timestamp };
    const expected = await hmacHex(secret, canonical(fields));
    if (!constantTimeEqual(expected, String(input.sign || '').toLowerCase())) throw new Error('支付签名无效');
    const priorEvent = await env.DB.prepare('SELECT order_code,payload_hash FROM payment_event WHERE provider_event_id=? LIMIT 1')
      .bind(input.provider_event_id).first<{ order_code: string; payload_hash: string }>();
    const payloadHash = await hmacHex(secret, canonical(fields));
    if (priorEvent) {
      if (priorEvent.order_code !== input.order_code || !constantTimeEqual(priorEvent.payload_hash, payloadHash)) throw new Error('支付服务商事件 ID 已用于其他通知');
      const current = await env.DB.prepare('SELECT status FROM payment_intent WHERE order_code=?').bind(input.order_code).first<{ status: string }>();
      if (current?.status !== 'paid') throw new Error('重复支付通知尚未完成订单入账，请稍后重试');
      return { already_paid: true };
    }
    return settleVerified(env, { orderCode: input.order_code, amountCents: Number(input.amount_cents), eventId: input.provider_event_id,
      providerRef: input.provider_ref, payloadHash });
  }

  static async reconcile(env: Bindings, orderCode: string, _origin: string) {
    const settings = await readSettings(env.DB);
    if (!String(settings.payment_secret || '') || !String(settings.payment_merchant_id || '')) throw new Error('尚未配置易支付 PID 和密钥');
    if ((settings.payment_provider || 'generic') === 'epay') {
      const gateway = gatewayUrl(settings);
      gateway.pathname = gateway.pathname.replace(/(?:submit|mapi)\.php$/i, 'api.php');
      if (!gateway.pathname.toLowerCase().endsWith('/api.php')) gateway.pathname = `${gateway.pathname.replace(/\/$/, '')}/api.php`;
      gateway.search = '';
      gateway.searchParams.set('act', 'order');
      gateway.searchParams.set('pid', settings.payment_merchant_id);
      gateway.searchParams.set('key', settings.payment_secret || '');
      gateway.searchParams.set('out_trade_no', orderCode);
      const response = await fetch(gateway, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`易支付查询接口返回 HTTP ${response.status}`);
      const result = await response.json() as { code?: number; msg?: string; status?: number; trade_no?: string; out_trade_no?: string; money?: string; pid?: string | number };
      if (Number(result.code) !== 1 || String(result.out_trade_no || '') !== orderCode) throw new Error(result.msg || '易支付没有返回匹配的订单');
      if (String(result.pid || settings.payment_merchant_id) !== settings.payment_merchant_id) throw new Error('易支付查询商户 PID 不匹配');
      if (Number(result.status) === 1) {
        const row = await env.DB.prepare('SELECT amount_cents FROM payment_intent WHERE order_code=?').bind(orderCode).first<{ amount_cents: number }>();
        if (!row || moneyToCents(result.money) !== Number(row.amount_cents)) throw new Error('易支付查询金额与本地订单不匹配');
        const eventId = `epay:${String(result.trade_no || orderCode)}`;
        const payloadHash = md5(`${orderCode}:${result.trade_no || ''}:${result.money}:${settings.payment_merchant_id}`);
        await settleVerified(env, { orderCode, amountCents: Number(row.amount_cents), eventId, providerRef: String(result.trade_no || ''), payloadHash });
        return { status: 'paid', order_code: orderCode, checked_at: Math.floor(Date.now() / 1000) };
      }
      return { status: 'pending', order_code: orderCode, checked_at: Math.floor(Date.now() / 1000) };
    }
    const queryUrl = String(settings.payment_query_url || '').trim();
    if (!queryUrl) throw new Error('尚未配置支付查询接口');
    const now = Math.floor(Date.now() / 1000), fields = { merchant_id: settings.payment_merchant_id, order_code: orderCode, timestamp: now };
    const url = new URL(queryUrl);
    for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value));
    url.searchParams.set('sign', await hmacHex(settings.payment_secret || '', canonical(fields)));
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`支付查询接口返回 HTTP ${response.status}`);
    const result = await response.json() as PaymentCallback;
    if (result.status === 'paid') await this.processCallback(env, result);
    return { status: result.status || 'unknown', order_code: orderCode, checked_at: now };
  }

  static async refundMallOrder(env: Bindings, orderCode: string) {
    const settings = await readSettings(env.DB);
    if ((settings.payment_provider || 'generic') !== 'epay') throw new Error('当前支付服务商未接入退款接口');
    const payment = await env.DB.prepare(`SELECT p.amount_cents,p.mall_order_id,p.status,m.status AS mall_status
      FROM payment_intent p JOIN mall_order m ON m.mall_order_id=p.mall_order_id WHERE p.order_code=? AND p.product_type='mall'`)
      .bind(orderCode).first<{ amount_cents: number; mall_order_id: number; status: string; provider_ref: string; mall_status: number }>();
    if (!payment || payment.status !== 'paid' || Number(payment.mall_status) !== 1) throw new Error('只可退款已支付、尚未发货的商城订单');
    const url = gatewayUrl(settings);
    url.pathname = url.pathname.replace(/(?:submit|mapi)\.php$/i, 'api.php');
    if (!url.pathname.toLowerCase().endsWith('/api.php')) url.pathname = `${url.pathname.replace(/\/$/, '')}/api.php`;
    url.search = '';
    const form = new URLSearchParams({ pid: settings.payment_merchant_id || '', key: settings.payment_secret || '', out_trade_no: orderCode,
      money: `${Math.floor(payment.amount_cents / 100)}.${String(payment.amount_cents % 100).padStart(2, '0')}` });
    const response = await fetch(`${url}?act=refund`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`易支付退款接口返回 HTTP ${response.status}`);
    const result = await response.json() as { code?: number; msg?: string };
    if (Number(result.code) !== 0) throw new Error(result.msg || '易支付退款未成功');
    const now = Math.floor(Date.now() / 1000);
    const changed = await env.DB.batch([
      env.DB.prepare("UPDATE payment_intent SET status='refunded' WHERE order_code=? AND status='paid'").bind(orderCode),
      env.DB.prepare('UPDATE mall_order SET status=3,updated_at=? WHERE mall_order_id=? AND status=1 AND changes()=1').bind(now, payment.mall_order_id),
      env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
        SELECT user_id,'mall_cash_refund',-amount_cents/100,0,1,?,'epay-refund',? FROM payment_intent WHERE order_code=? AND status='refunded' AND changes()=1`)
        .bind(orderCode, now, orderCode),
    ]);
    if (!changed[0]?.meta.changes || !changed[1]?.meta.changes) throw new Error('退款已由易支付受理，但本地订单状态更新失败，请立即核查订单');
    return { order_code: orderCode, refunded: true };
  }
}
