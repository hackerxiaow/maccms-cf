import type { Bindings } from '../types/index.ts';

type PaymentPlan = { code: string; name: string; type: 'points' | 'vip'; amount_cents: number; points?: number; vip_days?: number; enabled?: boolean };
type PaymentCallback = { order_code: string; amount_cents: number; merchant_id: string; provider_event_id: string; status: string; timestamp: number; sign: string; provider_ref?: string };

async function readSettings(db: D1Database): Promise<Record<string, string>> {
  const rows = await db.prepare(`SELECT key,value FROM config WHERE key IN
    ('payment_checkout_url','payment_query_url','payment_merchant_id','payment_secret','payment_currency','payment_products','site_url')`)
    .all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const row of rows.results || []) settings[row.key] = row.value;
  return settings;
}

function getPlans(settings: Record<string, string>): PaymentPlan[] {
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
  return Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${String(value)}`).join('&');
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

export class PaymentService {
  static async plans(db: D1Database): Promise<PaymentPlan[]> {
    return getPlans(await readSettings(db));
  }

  static async create(env: Bindings, userId: number, planCode: string, origin: string) {
    const settings = await readSettings(env.DB);
    const checkoutUrl = String(settings.payment_checkout_url || '').trim();
    const merchantId = String(settings.payment_merchant_id || '').trim();
    const secret = String(settings.payment_secret || '');
    if (!checkoutUrl || !merchantId || !secret) throw new Error('在线支付尚未配置，请联系网站管理员');
    const plan = getPlans(settings).find((item) => item.code === planCode);
    if (!plan) throw new Error('支付套餐不存在或已停用');
    const user = await env.DB.prepare('SELECT user_name FROM user WHERE user_id=? AND user_status=1').bind(userId).first<{ user_name: string }>();
    if (!user) throw new Error('会员账号不存在或已停用');
    const code = `MC${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 86400;
    const returnUrl = new URL('/user.html?payment=return', settings.site_url || origin).toString();
    const notifyUrl = new URL('/api/payment/notify', settings.site_url || origin).toString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_intent(order_code,user_id,product_type,product_value,amount_cents,points,vip_days,status,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,'pending',?,?)`).bind(code, userId, plan.type, plan.code, plan.amount_cents, plan.points || 0, plan.vip_days || 0, now, expiresAt),
      env.DB.prepare(`INSERT INTO "order"(order_code,user_id,order_status,order_price,order_time,order_points,order_pay_type)
        VALUES(?,?,0,?,?,?,'hosted')`).bind(code, userId, plan.amount_cents / 100, now, plan.points || 0),
    ]);
    const fields = {
      amount_cents: plan.amount_cents,
      currency: String(settings.payment_currency || 'CNY'),
      merchant_id: merchantId,
      notify_url: notifyUrl,
      order_code: code,
      return_url: returnUrl,
      timestamp: now,
      title: plan.name,
    };
    const checkout = new URL(checkoutUrl);
    for (const [key, value] of Object.entries(fields)) checkout.searchParams.set(key, String(value));
    checkout.searchParams.set('sign', await hmacHex(secret, canonical(fields)));
    return { order_code: code, amount_cents: plan.amount_cents, checkout_url: checkout.toString(), expires_at: expiresAt };
  }

  static async processCallback(env: Bindings, input: PaymentCallback) {
    const settings = await readSettings(env.DB);
    const secret = settings.payment_secret || '';
    if (!secret || input.merchant_id !== settings.payment_merchant_id) throw new Error('支付商户校验失败');
    if (input.status !== 'paid' || !input.order_code || !input.provider_event_id || !Number.isInteger(Number(input.amount_cents))) {
      throw new Error('支付通知参数无效');
    }
    const timestamp = Number(input.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 86400) throw new Error('支付通知已过期');
    const fields = {
      amount_cents: Number(input.amount_cents), merchant_id: input.merchant_id, order_code: input.order_code,
      provider_event_id: input.provider_event_id, status: input.status, timestamp,
    };
    const expected = await hmacHex(secret, canonical(fields));
    if (!constantTimeEqual(expected, String(input.sign || '').toLowerCase())) throw new Error('支付签名无效');
    const payloadHash = await hmacHex(secret, canonical(fields));
    const priorEvent = await env.DB.prepare('SELECT order_code,payload_hash FROM payment_event WHERE provider_event_id=? LIMIT 1')
      .bind(input.provider_event_id).first<{ order_code: string; payload_hash: string }>();
    if (priorEvent) {
      if (priorEvent.order_code !== input.order_code || !constantTimeEqual(priorEvent.payload_hash, payloadHash)) {
        throw new Error('支付服务商事件 ID 已用于其他通知');
      }
      const current = await env.DB.prepare('SELECT status FROM payment_intent WHERE order_code=?').bind(input.order_code)
        .first<{ status: string }>();
      if (current?.status !== 'paid') throw new Error('重复支付通知尚未完成订单入账，请稍后重试');
      return { already_paid: true };
    }
    const payment = await env.DB.prepare(`SELECT payment_id,user_id,product_type,points,vip_days,status,expires_at FROM payment_intent
      WHERE order_code=? AND amount_cents=? LIMIT 1`).bind(input.order_code, Number(input.amount_cents))
      .first<{ payment_id: number; user_id: number; product_type: string; points: number; vip_days: number; status: string; expires_at: number }>();
    if (!payment) throw new Error('订单不存在或金额不匹配');
    if (payment.status === 'paid') return { already_paid: true };
    if (payment.status !== 'pending' || payment.expires_at <= now) throw new Error('订单已过期或已取消');
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO payment_event(provider_event_id,order_code,payload_hash,received_at) VALUES(?,?,?,?)`)
        .bind(input.provider_event_id, input.order_code, payloadHash, now),
      env.DB.prepare(`UPDATE payment_intent SET status='paid',provider_ref=?,paid_at=?
        WHERE order_code=? AND amount_cents=? AND status='pending' AND expires_at>? AND changes()=1`)
        .bind(String(input.provider_ref || input.provider_event_id).slice(0, 200), now, input.order_code, Number(input.amount_cents), now),
      env.DB.prepare(`UPDATE user SET
        user_points=user_points+(SELECT points FROM payment_intent WHERE order_code=?),
        group_id=CASE WHEN (SELECT vip_days FROM payment_intent WHERE order_code=?)>0 THEN 2 ELSE group_id END,
        user_end_time=CASE WHEN (SELECT vip_days FROM payment_intent WHERE order_code=?)>0
          THEN MAX(user_end_time,?)+(SELECT vip_days FROM payment_intent WHERE order_code=?)*86400 ELSE user_end_time END
        WHERE user_id=(SELECT user_id FROM payment_intent WHERE order_code=?) AND changes()=1`)
        .bind(input.order_code, input.order_code, input.order_code, now, input.order_code, input.order_code),
      env.DB.prepare(`UPDATE "order" SET order_status=1,order_pay_type='hosted' WHERE order_code=? AND changes()=1`)
        .bind(input.order_code),
      env.DB.prepare(`INSERT INTO cash_log(user_id,cash_type,amount,points,status,note,operator,created_at)
        SELECT user_id,'payment',amount_cents/100,points,1,'在线支付入账',?,? FROM payment_intent WHERE order_code=? AND changes()=1`)
        .bind(String(input.provider_ref || 'payment-gateway').slice(0, 100), now, input.order_code),
      env.DB.prepare(`INSERT INTO user_notification(user_id,title,body,kind,created_at)
        SELECT user_id,'支付成功','订单 '+order_code+' 已完成', 'payment',? FROM payment_intent WHERE order_code=? AND changes()=1`)
        .bind(now, input.order_code),
    ]);
    const [updated, committedEvent] = await Promise.all([
      env.DB.prepare("SELECT status FROM payment_intent WHERE order_code=?").bind(input.order_code)
        .first<{ status: string }>(),
      env.DB.prepare('SELECT order_code,payload_hash FROM payment_event WHERE provider_event_id=?')
        .bind(input.provider_event_id).first<{ order_code: string; payload_hash: string }>(),
    ]);
    if (updated?.status !== 'paid') {
      if (committedEvent && (committedEvent.order_code !== input.order_code || !constantTimeEqual(committedEvent.payload_hash, payloadHash))) {
        throw new Error('支付服务商事件 ID 已用于其他通知');
      }
      throw new Error('支付通知未完成订单入账，请稍后重试');
    }
    return { already_paid: true };
  }

  static async reconcile(env: Bindings, orderCode: string, origin: string) {
    const settings = await readSettings(env.DB);
    const queryUrl = String(settings.payment_query_url || '').trim();
    if (!queryUrl) throw new Error('尚未配置支付查询接口');
    const secret = settings.payment_secret || '';
    if (!secret) throw new Error('尚未配置支付签名密钥');
    const now = Math.floor(Date.now() / 1000);
    const fields = { merchant_id: String(settings.payment_merchant_id || ''), order_code: orderCode, timestamp: now };
    const url = new URL(queryUrl);
    for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value));
    url.searchParams.set('sign', await hmacHex(secret, canonical(fields)));
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`支付查询接口返回 HTTP ${response.status}`);
    const result = await response.json() as PaymentCallback;
    if (result.status === 'paid') await this.processCallback(env, result);
    return { status: result.status || 'unknown', order_code: orderCode, checked_at: now };
  }
}
