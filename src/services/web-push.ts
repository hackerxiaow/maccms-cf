const encoder = new TextEncoder();
const decode64url = (value: string): Uint8Array => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
const encode64url = (value: Uint8Array): string => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};

async function hmac(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const blocks: Uint8Array[] = [];
  let previous: Uint8Array<ArrayBufferLike> = new Uint8Array();
  for (let counter = 1; blocks.reduce((sum, block) => sum + block.length, 0) < length; counter += 1) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
  }
  return concat(...blocks).slice(0, length);
}

async function vapidToken(endpoint: URL, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const publicBytes = decode64url(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('VAPID 公钥格式无效');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: encode64url(publicBytes.slice(1, 33)), y: encode64url(publicBytes.slice(33)),
    d: privateKey, ext: true, key_ops: ['sign'],
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const base64 = (value: string) => encode64url(encoder.encode(value));
  const head = base64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = base64(JSON.stringify({ aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const unsigned = `${head}.${body}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)));
  return `${unsigned}.${encode64url(signature)}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const clientPublicBytes = decode64url(p256dh);
  const authSecret = decode64url(auth);
  if (clientPublicBytes.length !== 65 || clientPublicBytes[0] !== 4 || authSecret.length < 16) throw new Error('Push 订阅密钥格式无效');
  const clientPublic = await crypto.subtle.importKey('raw', clientPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as unknown as CryptoKeyPair;
  const deriveEcdhBits = crypto.subtle.deriveBits as unknown as (algorithm: { name: 'ECDH'; public: CryptoKey }, baseKey: CryptoKey, length: number) => Promise<ArrayBuffer>;
  const shared = new Uint8Array(await deriveEcdhBits({ name: 'ECDH', public: clientPublic }, localKeys.privateKey, 256));
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey) as ArrayBuffer);
  const authPrk = await hmac(authSecret, shared);
  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublicBytes, serverPublic);
  const inputKeyMaterial = await hkdfExpand(authPrk, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentPrk = await hmac(salt, inputKeyMaterial);
  const cek = await hkdfExpand(contentPrk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(contentPrk, encoder.encode('Content-Encoding: nonce\0'), 12);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

export class WebPushService {
  static async generateKeys(db: D1Database): Promise<{ publicKey: string }> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as unknown as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
    if (!jwk.d || !jwk.x || !jwk.y) throw new Error('生成 VAPID 密钥失败');
    const publicKey = encode64url(concat(new Uint8Array([4]), decode64url(jwk.x), decode64url(jwk.y)));
    await db.batch([
      db.prepare("INSERT OR REPLACE INTO config(key,value) VALUES('push_vapid_public_key',?)").bind(publicKey),
      db.prepare("INSERT OR REPLACE INTO config(key,value) VALUES('push_vapid_private_key',?)").bind(jwk.d),
    ]);
    return { publicKey };
  }

  static async publicKey(db: D1Database): Promise<string> {
    const row = await db.prepare("SELECT value FROM config WHERE key='push_vapid_public_key'").first<{ value: string }>();
    return row?.value || '';
  }

  static async send(db: D1Database, payload: { title: string; body: string; url?: string }, userId = 0): Promise<{ sent: number; removed: number; failed: number }> {
    const rows = await db.prepare(`SELECT key,value FROM config WHERE key IN ('push_vapid_public_key','push_vapid_private_key','push_vapid_subject')`)
      .all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of rows.results || []) settings[row.key] = row.value;
    if (!settings.push_vapid_public_key || !settings.push_vapid_private_key) return { sent: 0, removed: 0, failed: 0 };
    const query = userId > 0
      ? db.prepare('SELECT subscription_id,user_id,endpoint,p256dh,auth_secret FROM web_push_subscription WHERE user_id=? LIMIT 1000').bind(userId)
      : db.prepare('SELECT subscription_id,user_id,endpoint,p256dh,auth_secret FROM web_push_subscription LIMIT 5000');
    const subscriptions = await query.all<{ subscription_id: number; user_id: number; endpoint: string; p256dh: string; auth_secret: string }>();
    let sent = 0, removed = 0, failed = 0;
    for (const subscription of subscriptions.results || []) {
      try {
        const endpoint = new URL(subscription.endpoint);
        if (endpoint.protocol !== 'https:') throw new Error('Push endpoint 必须使用 HTTPS');
        const authorization = await vapidToken(endpoint, settings.push_vapid_public_key, settings.push_vapid_private_key, settings.push_vapid_subject || 'mailto:admin@example.com');
        const body = await encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth_secret);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `vapid t=${authorization}, k=${settings.push_vapid_public_key}`,
            'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
            TTL: '86400', Urgency: 'normal',
          },
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 404 || response.status === 410) {
          await db.prepare('DELETE FROM web_push_subscription WHERE subscription_id=?').bind(subscription.subscription_id).run();
          removed += 1;
        } else if (response.ok) {
          await db.prepare('UPDATE web_push_subscription SET last_used_at=?,last_error=? WHERE subscription_id=?')
            .bind(Math.floor(Date.now() / 1000), '', subscription.subscription_id).run();
          sent += 1;
        } else {
          await db.prepare('UPDATE web_push_subscription SET last_error=? WHERE subscription_id=?')
            .bind(`Push service HTTP ${response.status}`, subscription.subscription_id).run();
          failed += 1;
        }
      } catch (error) {
        await db.prepare('UPDATE web_push_subscription SET last_error=? WHERE subscription_id=?')
          .bind((error instanceof Error ? error.message : 'Push 发送失败').slice(0, 500), subscription.subscription_id).run().catch(() => {});
        failed += 1;
      }
    }
    return { sent, removed, failed };
  }
}
