import type { Bindings } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { UserService } from './user.ts';

type TrialToken = { session_hash: string; expires_at: number; url: string; kind: 'playlist' | 'stream' };

function b64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(value: string): string {
  const base = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base + '='.repeat((4 - base.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let delta = 0;
  for (let i = 0; i < left.length; i += 1) delta |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return delta === 0;
}

function mediaKind(url: URL): TrialToken['kind'] | null {
  if (/\.(?:m3u8?|m3u)$/i.test(url.pathname)) return 'playlist';
  if (/\.(?:mp4|m4v|m4s|ts|aac|mp3|key)$/i.test(url.pathname)) return 'stream';
  return null;
}

function isPublicHttpsUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host.includes(':') && (host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host))) return false;
  return true;
}

export class PlaybackTrialService {
  private static async secret(env: Bindings): Promise<string> {
    return UserService.getTokenSecret(env.DB, env.JWT_SECRET || '');
  }

  private static async token(env: Bindings, input: TrialToken): Promise<string> {
    const payload = b64urlEncode(JSON.stringify(input));
    return `${payload}.${await hmac(await this.secret(env), payload)}`;
  }

  private static async signedTarget(env: Bindings, token: string): Promise<TrialToken> {
    if (token.length > 9000 || !token.includes('.')) throw new Error('试看链接无效');
    const [payload, signature] = token.split('.', 2);
    if (!payload || !/^[a-f0-9]{64}$/i.test(signature || '') || !equal(await hmac(await this.secret(env), payload), signature.toLowerCase())) throw new Error('试看链接签名无效');
    let parsed: TrialToken;
    try { parsed = JSON.parse(b64urlDecode(payload)) as TrialToken; } catch { throw new Error('试看链接格式无效'); }
    if (!parsed.session_hash || !Number.isInteger(parsed.expires_at) || parsed.expires_at <= Math.floor(Date.now() / 1000)) throw new Error('试看时间已结束');
    const url = new URL(String(parsed.url || ''));
    const kind = mediaKind(url);
    if (!isPublicHttpsUrl(url) || (kind && kind !== parsed.kind) || (!kind && parsed.kind !== 'stream')) throw new Error('试看资源类型或地址无效');
    const session = await env.DB.prepare('SELECT expires_at FROM playback_trial_session WHERE session_hash=?').bind(parsed.session_hash).first<{ expires_at: number }>();
    if (!session || Number(session.expires_at) !== parsed.expires_at || Number(session.expires_at) <= Math.floor(Date.now() / 1000)) throw new Error('试看时间已结束');
    parsed.url = url.toString();
    return parsed;
  }

  static async begin(env: Bindings, input: { userId: number; ip: string; userAgent: string; vodId: number; sid: number; nid: number; sourceUrl: string; trialSeconds: number; origin: string }) {
    let source: URL;
    try { source = new URL(input.sourceUrl); } catch { throw new Error('此线路不支持安全试看，请切换 MP4 或 HLS 直连线路'); }
    const kind = mediaKind(source);
    if (!isPublicHttpsUrl(source) || !kind) throw new Error('此线路不支持安全试看；请选择 HTTPS 的 MP4 或 HLS 直连线路');
    const identity = `${input.ip || 'unknown'}|${input.userAgent.slice(0, 180)}`;
    const sessionHash = await AuthUtils.sha256(`${identity}:${input.vodId}:${input.nid}`);
    const now = Math.floor(Date.now() / 1000);
    const duration = Math.min(1800, Math.max(1, Math.trunc(input.trialSeconds)));
    await env.DB.prepare(`INSERT OR IGNORE INTO playback_trial_session(session_hash,user_id,vod_id,sid,nid,started_at,expires_at)
      VALUES(?,?,?,?,?,?,?)`).bind(sessionHash, input.userId, input.vodId, input.sid, input.nid, now, now + duration).run();
    const session = await env.DB.prepare('SELECT expires_at FROM playback_trial_session WHERE session_hash=?').bind(sessionHash).first<{ expires_at: number }>();
    if (!session || Number(session.expires_at) <= now) throw new Error('此影片的试看时长已用完；登录会员或购买后可继续观看');
    const expiresAt = Number(session.expires_at);
    const playbackToken = await this.token(env, { session_hash: sessionHash, expires_at: expiresAt, url: source.toString(), kind });
    if (playbackToken.length > 9000) throw new Error('播放源地址过长，当前线路不能安全试看');
    return { url: `${input.origin}/api/playback/trial/${playbackToken}`, trial_seconds: expiresAt - now, expires_at: expiresAt };
  }

  static async serve(env: Bindings, token: string, request: Request, origin: string): Promise<Response> {
    let target: TrialToken;
    try { target = await this.signedTarget(env, token); }
    catch (error) { return new Response(error instanceof Error ? error.message : '试看时间已结束', { status: 403, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } }); }
    const headers = new Headers({ Accept: target.kind === 'playlist' ? 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*' : '*/*' });
    const range = request.headers.get('Range');
    if (range && /^bytes=\d*-\d*(?:,\d*-\d*)?$/.test(range) && range.length < 100) headers.set('Range', range);
    let upstream: Response | null = null;
    let finalUrl = target.url;
    try {
      for (let hop = 0; hop <= 3; hop += 1) {
        upstream = await fetch(finalUrl, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers, redirect: 'manual' });
        if (upstream.status < 300 || upstream.status >= 400) break;
        const location = upstream.headers.get('Location');
        if (!location || hop === 3) break;
        const redirectUrl = new URL(location, finalUrl);
        if (!isPublicHttpsUrl(redirectUrl)) return new Response('播放源重定向地址无效', { status: 502, headers: { 'Cache-Control': 'no-store' } });
        finalUrl = redirectUrl.toString();
      }
    } catch { return new Response('播放源连接失败', { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
    if (!upstream) return new Response('播放源连接失败', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    if (upstream.status >= 300 && upstream.status < 400) return new Response('播放源重定向失败，请切换线路', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) return new Response('播放源暂不可用', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type','content-length','content-range','accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value && name !== 'content-type') responseHeaders.set(name, value);
      else if (value && name === 'content-type' && target.kind !== 'playlist') responseHeaders.set(name, value);
    }
    if (target.kind === 'playlist' && upstream.ok) {
      const text = await upstream.text();
      if (text.length > 1_500_000) return new Response('播放列表过大', { status: 502, headers: responseHeaders });
      const rewrite = async (raw: string) => {
        let next: URL;
        try { next = new URL(raw, finalUrl); } catch { return ''; }
        const kind = mediaKind(next) || 'stream';
        if (!isPublicHttpsUrl(next)) return '';
        const child = await this.token(env, { session_hash: target.session_hash, expires_at: target.expires_at, url: next.toString(), kind });
        return `${origin}/api/playback/trial/${child}`;
      };
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        if (line.startsWith('#')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            const replaced = await rewrite(match[1]);
            lines[index] = replaced ? line.replace(match[0], `URI="${replaced}"`) : '';
          }
        } else {
          lines[index] = await rewrite(line);
        }
      }
      responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      responseHeaders.delete('Content-Length'); responseHeaders.delete('Content-Range'); responseHeaders.delete('Accept-Ranges');
      return new Response(request.method === 'HEAD' ? null : `${lines.join('\n')}\n`, { status: 200, headers: responseHeaders });
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  }
}
