import { AuthUtils } from '../utils/auth.ts';

type SecurityEnv = { DB: D1Database };
type TokenAction = 'verify' | 'reset';
type MailerContext = {
  WorkerMailer: typeof import('worker-mailer').WorkerMailer;
  options: import('worker-mailer').WorkerMailerOptions;
  from: { name?: string; email: string };
  siteName: string;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function consumeRateLimit(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = nowSeconds();
  const storedKey = await AuthUtils.sha256(key);
  const existing = await db.prepare('SELECT hits,window_started_at,blocked_until FROM auth_rate_limit WHERE rate_key=?')
    .bind(storedKey).first<{ hits: number; window_started_at: number; blocked_until: number }>();
  if (existing?.blocked_until && existing.blocked_until > now) return false;
  const reset = !existing || existing.window_started_at <= now - windowSeconds;
  const hits = reset ? 1 : Number(existing.hits) + 1;
  const blockedUntil = !reset && hits >= limit ? now + windowSeconds : 0;
  await db.prepare(`INSERT INTO auth_rate_limit(rate_key,window_started_at,hits,blocked_until) VALUES(?,?,?,?)
    ON CONFLICT(rate_key) DO UPDATE SET window_started_at=excluded.window_started_at,hits=excluded.hits,blocked_until=excluded.blocked_until`)
    .bind(storedKey, reset ? now : existing!.window_started_at, hits, blockedUntil).run();
  return hits <= limit;
}

export async function clearRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM auth_rate_limit WHERE rate_key=?').bind(await AuthUtils.sha256(key)).run();
}

async function getMailerContext(env: SecurityEnv): Promise<MailerContext> {
  const config = await env.DB.prepare(`SELECT key,value FROM config WHERE key IN
    ('mail_smtp_host','mail_smtp_port','mail_smtp_secure','mail_smtp_starttls','mail_smtp_auth_type','mail_smtp_username','mail_smtp_password','mail_from','site_name','site_url')`)
    .all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const item of config.results || []) settings[item.key] = item.value;
  const host = (settings.mail_smtp_host || '').trim();
  const port = Number(settings.mail_smtp_port || 587);
  const from = (settings.mail_from || '').trim();
  const username = (settings.mail_smtp_username || '').trim();
  const password = settings.mail_smtp_password || '';
  if (!host || !from) throw new Error('邮件服务未配置，请联系网站管理员');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP 端口配置无效');
  if (Boolean(username) !== Boolean(password)) throw new Error('SMTP 用户名和密码必须同时填写');
  const fromMatch = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const senderEmail = (fromMatch ? fromMatch[2] : from).trim();
  if (!MemberSecurityService.validEmail(senderEmail)) throw new Error('发件人地址格式无效');
  const siteName = settings.site_name || 'MacCMS';
  const { WorkerMailer } = await import('worker-mailer');
  const options = {
    host,
    port,
    secure: settings.mail_smtp_secure === '1',
    startTls: settings.mail_smtp_starttls !== '0',
    authType: (['plain', 'login', 'cram-md5'].includes(settings.mail_smtp_auth_type) ? settings.mail_smtp_auth_type : 'plain') as 'plain' | 'login' | 'cram-md5',
    credentials: username ? { username, password } : undefined,
    name: (() => { try { return new URL(settings.site_url || 'https://localhost').hostname; } catch { return 'maccms.local'; } })(),
    socketTimeoutMs: 10000,
    responseTimeoutMs: 10000,
  };
  return { WorkerMailer, options, from: fromMatch ? { name: fromMatch[1].trim(), email: senderEmail } : { email: senderEmail }, siteName };
}

async function sendCode(env: SecurityEnv, email: string, code: string, action: TokenAction): Promise<void> {
  const mailer = await getMailerContext(env);
  const purpose = action === 'verify' ? '验证邮箱' : '重置密码';
  const escapedName = mailer.siteName.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  await mailer.WorkerMailer.send(mailer.options, {
    from: mailer.from,
    to: { email },
    subject: `${mailer.siteName} - ${purpose}验证码`,
    text: `您的${purpose}验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略此邮件。`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.8"><p>${escapedName} ${purpose}</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>验证码 10 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`,
  });
}

export class MemberSecurityService {
  static validEmail(value: string): boolean {
    return value.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  static async sendTestEmail(env: SecurityEnv, emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (!this.validEmail(email)) throw new Error('测试收件邮箱格式无效');
    const mailer = await getMailerContext(env);
    await mailer.WorkerMailer.send(mailer.options, {
      from: mailer.from,
      to: { email },
      subject: `${mailer.siteName} SMTP 配置测试`,
      text: `这是一封来自 ${mailer.siteName} 的 SMTP 配置测试邮件。`,
      html: `<p>这是一封来自 ${mailer.siteName.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))} 的 SMTP 配置测试邮件。</p>`,
    });
  }

  static async issueCode(env: SecurityEnv, userId: number, emailInput: string, action: TokenAction, ip = ''): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (!this.validEmail(email)) throw new Error('邮箱格式无效');
    const now = nowSeconds();
    if (!await consumeRateLimit(env.DB, `${action}:ip:${ip || 'unknown'}`, 5, 3600)) throw new Error('操作过于频繁，请稍后重试');
    if (!await consumeRateLimit(env.DB, `${action}:email:${email}`, 3, 3600)) throw new Error('该邮箱请求过于频繁，请稍后重试');
    const recent = await env.DB.prepare(`SELECT token_id FROM member_email_token
      WHERE user_id=? AND action=? AND email=? AND created_at>? AND consumed_at=0 ORDER BY token_id DESC LIMIT 1`)
      .bind(userId, action, email, now - 60).first();
    if (recent) throw new Error('验证码已发送，请 60 秒后再试');
    await env.DB.prepare(`UPDATE member_email_token SET consumed_at=? WHERE user_id=? AND action=? AND consumed_at=0`)
      .bind(now, userId, action).run();
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = String((((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) % 1000000).padStart(6, '0');
    const tokenHash = await AuthUtils.sha256(`${action}:${email}:${code}:${now}`);
    await env.DB.prepare(`INSERT INTO member_email_token(user_id,email,action,token_hash,expires_at,created_at,request_ip)
      VALUES(?,?,?,?,?,?,?)`).bind(userId, email, action, tokenHash, now + 600, now, ip.slice(0, 64)).run();
    try {
      await sendCode(env, email, code, action);
    } catch (error) {
      await env.DB.prepare(`UPDATE member_email_token SET consumed_at=? WHERE user_id=? AND action=? AND created_at=?`)
        .bind(now, userId, action, now).run();
      throw error;
    }
  }

  static async verifyCode(db: D1Database, userId: number, emailInput: string, action: TokenAction, codeInput: string): Promise<boolean> {
    const email = emailInput.trim().toLowerCase();
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) return false;
    const now = nowSeconds();
    const row = await db.prepare(`SELECT token_id,token_hash,created_at,attempts FROM member_email_token
      WHERE user_id=? AND email=? AND action=? AND consumed_at=0 AND expires_at>? ORDER BY token_id DESC LIMIT 1`)
      .bind(userId, email, action, now).first<{ token_id: number; token_hash: string; created_at: number; attempts: number }>();
    if (!row) return false;
    const actual = await AuthUtils.sha256(`${action}:${email}:${code}:${row.created_at}`);
    let difference = 0;
    for (let i = 0; i < actual.length; i += 1) difference |= actual.charCodeAt(i) ^ row.token_hash.charCodeAt(i);
    if (difference !== 0) {
      const attempts = Number(row.attempts || 0) + 1;
      await db.prepare('UPDATE member_email_token SET attempts=?,consumed_at=? WHERE token_id=?')
        .bind(attempts, attempts >= 5 ? now : 0, row.token_id).run();
      return false;
    }
    const changed = await db.prepare('UPDATE member_email_token SET consumed_at=? WHERE token_id=? AND consumed_at=0')
      .bind(now, row.token_id).run();
    return Number(changed.meta.changes || 0) === 1;
  }

  static async resetPassword(env: SecurityEnv, emailInput: string, code: string, password: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (!this.validEmail(email)) throw new Error('邮箱格式无效');
    if (password.length < 8 || password.length > 128) throw new Error('新密码长度须为 8-128 个字符');
    const user = await env.DB.prepare('SELECT user_id FROM user WHERE lower(user_email)=? AND user_status=1 LIMIT 1')
      .bind(email).first<{ user_id: number }>();
    if (!user) throw new Error('验证码无效或已过期');
    if (!await this.verifyCode(env.DB, user.user_id, email, 'reset', code)) throw new Error('验证码无效或已过期');
    const hash = await AuthUtils.hashPassword(password);
    const now = nowSeconds();
    await env.DB.batch([
      env.DB.prepare('UPDATE user SET user_pwd=? WHERE user_id=? AND user_status=1').bind(hash, user.user_id),
      env.DB.prepare('UPDATE user_session SET revoked_at=? WHERE user_id=? AND revoked_at=0').bind(now, user.user_id),
      env.DB.prepare('UPDATE member_email_token SET consumed_at=? WHERE user_id=? AND consumed_at=0').bind(now, user.user_id),
    ]);
  }

  static async verifyEmail(db: D1Database, emailInput: string, code: string): Promise<boolean> {
    const email = emailInput.trim().toLowerCase();
    const user = await db.prepare('SELECT user_id FROM user WHERE lower(user_email)=? AND user_status=1 LIMIT 1')
      .bind(email).first<{ user_id: number }>();
    if (!user || !await this.verifyCode(db, user.user_id, email, 'verify', code)) return false;
    const result = await db.prepare('UPDATE user SET user_email_verified=1 WHERE user_id=? AND lower(user_email)=? AND user_status=1')
      .bind(user.user_id, email).run();
    return Number(result.meta.changes || 0) === 1;
  }
}
