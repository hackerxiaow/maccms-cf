import type { Bindings } from '../types/index.ts';

export class TurnstileService {
  static async publicConfig(db: D1Database): Promise<{ enabled: boolean; site_key: string }> {
    const rows = await db.prepare("SELECT key,value FROM config WHERE key IN ('security_turnstile_enabled','turnstile_site_key')")
      .all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of rows.results || []) settings[row.key] = row.value;
    return { enabled: settings.security_turnstile_enabled === '1' && Boolean(settings.turnstile_site_key), site_key: settings.turnstile_site_key || '' };
  }

  static async verify(env: Bindings, token: unknown, remoteIp: string, requestUrl: string): Promise<void> {
    const rows = await env.DB.prepare("SELECT key,value FROM config WHERE key IN ('security_turnstile_enabled','turnstile_secret_key')")
      .all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of rows.results || []) settings[row.key] = row.value;
    if (settings.security_turnstile_enabled !== '1') return;
    const responseToken = String(token || '').trim();
    if (!responseToken || responseToken.length > 4096 || !settings.turnstile_secret_key) throw new Error('请完成验证码验证');
    const form = new URLSearchParams({ secret: settings.turnstile_secret_key, response: responseToken });
    if (remoteIp) form.set('remoteip', remoteIp);
    let result: { success?: boolean; hostname?: string; 'error-codes'?: string[] };
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = await response.json() as typeof result;
    } catch {
      throw new Error('验证码服务暂不可用，请稍后重试');
    }
    if (!result.success) throw new Error('验证码无效或已过期，请重新验证');
    let expectedHost = '';
    try { expectedHost = new URL(requestUrl).hostname.toLowerCase(); } catch {}
    if (expectedHost && result.hostname && result.hostname.toLowerCase() !== expectedHost) throw new Error('验证码站点校验失败');
  }
}
