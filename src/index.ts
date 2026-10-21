// ========================================================
// MacCMS Cloudflare Serverless 主入口 (Worker + Pages + D1)
// ========================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, CollectNodeItem } from './types/index.ts';
import {
  provideVodRouter,
  provideArtRouter,
  provideActorRouter,
  provideRoleRouter,
  provideWebsiteRouter,
  provideMangaRouter,
  incApiRouter,
} from './routes/provide.ts';
import { apiRouter } from './routes/api.ts';
import { adminRouter } from './routes/admin.ts';
import { timmingRouter } from './routes/timming.ts';
import { CollectorService } from './services/collector.ts';
import { VodService } from './services/vod.ts';
import { runDueCloudTasks } from './routes/cloud-admin.ts';

const app = new Hono<{ Bindings: Bindings }>();

// 启用全局 CORS 跨域支持 (方便小程序与三方前端对接)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Private membership data and order responses must never be shared by browser/CDN caches.
app.use('/api/user/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
});
app.use('/api/mall/orders*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store');
});

// 内容详情访问统计：仅记录已成功返回的内容详情，不记录普通 API 与静态资源。
app.use('*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || c.res.status < 200 || c.res.status >= 300) return;
  const match = new URL(c.req.url).pathname.match(/^\/api\/(vod|art|topic|actor|website|manga|role|plot)\/detail\/(\d+)$/);
  if (!match) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
    const visitorHash = Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    await c.env.DB.prepare('INSERT INTO traffic_event (model, content_id, visitor_hash, created_at, day) VALUES (?, ?, ?, ?, ?)')
      .bind(match[1], Number(match[2]), visitorHash, Math.floor(Date.now() / 1000), day).run();
  } catch (err) {
    console.error('Failed to write content traffic event:', err);
  }
});

// 1. 挂载 MacCMS 官方标准对外提供接口
app.route('/api.php/provide/vod', provideVodRouter);
app.route('/api.php/provide/art', provideArtRouter);
app.route('/api.php/provide/actor', provideActorRouter);
app.route('/api.php/provide/role', provideRoleRouter);
app.route('/api.php/provide/website', provideWebsiteRouter);
app.route('/api.php/provide/manga', provideMangaRouter);
app.route('/provide/vod', provideVodRouter);
app.route('/provide/art', provideArtRouter);
app.route('/provide/actor', provideActorRouter);
app.route('/provide/role', provideRoleRouter);
app.route('/provide/website', provideWebsiteRouter);
app.route('/provide/manga', provideMangaRouter);

// 兼容经典 MacCMS v8 采集接口路径
app.route('/inc', incApiRouter);

// 2. 挂载定时任务接口
app.route('/api.php/timming/index', timmingRouter);
app.route('/api.php/timming', timmingRouter);
app.route('/api/timming/index', timmingRouter);
app.route('/api/timming', timmingRouter);

// 3. 挂载现代 RESTful 前端 API
app.route('/api', apiRouter);

// 4. 挂载后台管理系统 API
app.route('/api/admin', adminRouter);

// RSS feed for readers and content-discovery services.
app.get('/rss.xml', async (c) => {
  const config = await VodService.getConfigs(c.env.DB);
  const base = String(config.site_url || c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  const [vod, art, role, plot] = await Promise.all([
    c.env.DB.prepare('SELECT vod_id AS id,vod_name AS title,vod_blurb AS summary,vod_time AS published FROM vod WHERE vod_status=1 ORDER BY vod_time DESC LIMIT 80')
      .all<{ id: number; title: string; summary: string; published: number }>(),
    c.env.DB.prepare('SELECT art_id AS id,art_name AS title,art_blurb AS summary,art_time AS published FROM art WHERE art_status=1 ORDER BY art_time DESC LIMIT 40')
      .all<{ id: number; title: string; summary: string; published: number }>(),
    c.env.DB.prepare('SELECT role_id AS id,role_name AS title,role_remarks AS summary,role_time AS published FROM role WHERE role_status=1 ORDER BY role_time DESC LIMIT 40')
      .all<{ id: number; title: string; summary: string; published: number }>(),
    c.env.DB.prepare(`SELECT vod_id AS id,vod_name AS title,vod_blurb AS summary,vod_time AS published FROM vod
      WHERE vod_status=1 AND COALESCE(vod_plot,0)>0 AND COALESCE(vod_plot_name,'')<>'' ORDER BY vod_time DESC LIMIT 40`)
      .all<{ id: number; title: string; summary: string; published: number }>(),
  ]);
  const entries = [
    ...(vod.results || []).map((item) => ({ ...item, model: 'vod' })),
    ...(art.results || []).map((item) => ({ ...item, model: 'art' })),
    ...(role.results || []).map((item) => ({ ...item, model: 'role' })),
    ...(plot.results || []).map((item) => ({ ...item, model: 'plot' })),
  ].sort((a, b) => b.published - a.published).slice(0, 100);
  const escapeXml = (value: unknown) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const items = entries.map((item) => {
    const page = item.model === 'vod' ? 'detail' : item.model;
    const url = `${base}/${page}.html?id=${item.id}`;
    const date = item.published ? new Date(item.published * 1000).toUTCString() : new Date().toUTCString();
    return `<item><title>${escapeXml(item.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(item.summary)}</description><pubDate>${date}</pubDate></item>`;
  }).join('');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(config.site_name || c.env.SITE_NAME || 'MacCMS')}</title><link>${escapeXml(base)}</link><description>Latest published videos and articles</description>${items}</channel></rss>`, 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300',
  });
});
app.get('/rss', (c) => c.redirect('/rss.xml', 301));
app.get('/robots.txt', async (c) => {
  const config = await VodService.getConfigs(c.env.DB);
  const base = String(config.site_url || c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  return c.text(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml`, 200, {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300',
  });
});

// 动态 XML Sitemap：把 MacCMS 内容详情映射到当前静态前台的真实 URL 结构。
app.get('/sitemap.xml', async (c) => {
  const base = String((await VodService.getConfigs(c.env.DB)).site_url || c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  const [vod, art, topic, actor, role, plot, manga] = await Promise.all([
    c.env.DB.prepare('SELECT vod_id AS id, vod_time AS updated FROM vod WHERE vod_status = 1 ORDER BY vod_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT art_id AS id, art_time AS updated FROM art WHERE art_status = 1 ORDER BY art_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT topic_id AS id, topic_time AS updated FROM topic WHERE topic_status = 1 ORDER BY topic_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT actor_id AS id, actor_time AS updated FROM actor WHERE actor_status = 1 ORDER BY actor_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT role_id AS id, role_time AS updated FROM role WHERE role_status = 1 ORDER BY role_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT vod_id AS id, vod_time AS updated FROM vod WHERE vod_status = 1 AND COALESCE(vod_plot,0)>0 AND COALESCE(vod_plot_name,\'\')<>\'\' ORDER BY vod_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
    c.env.DB.prepare('SELECT manga_id AS id, manga_time AS updated FROM manga WHERE manga_status = 1 ORDER BY manga_time DESC LIMIT 10000').all<{ id: number; updated: number }>(),
  ]);
  const entries: Array<{ loc: string; updated: number }> = [
    ...(vod.results || []).map((row) => ({ loc: `${base}/detail.html?id=${row.id}`, updated: row.updated })),
    ...(art.results || []).map((row) => ({ loc: `${base}/art.html?id=${row.id}`, updated: row.updated })),
    ...(topic.results || []).map((row) => ({ loc: `${base}/topic.html?id=${row.id}`, updated: row.updated })),
    ...(actor.results || []).map((row) => ({ loc: `${base}/actor_detail.html?id=${row.id}`, updated: row.updated })),
    ...(role.results || []).map((row) => ({ loc: `${base}/role.html?id=${row.id}`, updated: row.updated })),
    ...(plot.results || []).map((row) => ({ loc: `${base}/plot.html?id=${row.id}`, updated: row.updated })),
    ...(manga.results || []).map((row) => ({ loc: `${base}/manga.html?id=${row.id}`, updated: row.updated })),
  ];
  const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const urls = [`${base}/`, `${base}/type.html`, `${base}/topic.html`, `${base}/art.html`, `${base}/actor.html`, `${base}/role.html`, `${base}/plot.html`, `${base}/live.html`, `${base}/manga.html`]
    .map((loc) => `<url><loc>${escapeXml(loc)}</loc></url>`);
  for (const entry of entries) {
    const lastmod = entry.updated ? new Date(entry.updated * 1000).toISOString() : '';
    urls.push(`<url><loc>${escapeXml(entry.loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  }
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, 200, {
    'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300',
  });
});

// Optional R2-backed media delivery for uploaded poster and logo files.
app.get('/media/*', async (c) => {
  const requestUrl = new URL(c.req.url);
  let key: string;
  try { key = decodeURIComponent(requestUrl.pathname.slice('/media/'.length)); }
  catch { return c.text('Invalid media path', 400); }
  if (!key || key.includes('..') || key.startsWith('/')) return c.text('Invalid media path', 400);
  if (key.startsWith('tg/')) {
    const asset = await c.env.DB.prepare(`SELECT provider_ref,content_type FROM media_asset
      WHERE storage_provider='telegram' AND public_url=? LIMIT 1`).bind(`${requestUrl.origin}${requestUrl.pathname}`).first<{ provider_ref: string; content_type: string }>();
    if (!asset?.provider_ref) return c.text('Media not found', 404);
    const splitAt = asset.provider_ref.indexOf(':');
    const accountId = splitAt > 0 ? Number(asset.provider_ref.slice(0, splitAt)) : 0;
    const fileId = splitAt >= 0 ? asset.provider_ref.slice(splitAt + 1) : asset.provider_ref;
    const [account, legacyToken, apiBaseRow] = await Promise.all([
      accountId > 0 ? c.env.DB.prepare('SELECT bot_token FROM telegram_storage_account WHERE account_id=?').bind(accountId).first<{ bot_token: string }>() : Promise.resolve(null),
      accountId === 0 ? c.env.DB.prepare("SELECT value FROM config WHERE key='telegram_bot_token'").first<{ value: string }>() : Promise.resolve(null),
      c.env.DB.prepare("SELECT value FROM config WHERE key='telegram_api_base'").first<{ value: string }>(),
    ]);
    const token = account?.bot_token || legacyToken?.value || '';
    if (!token) return c.text('Telegram media storage is not configured', 503);
    let apiBase: URL;
    try { apiBase = new URL(apiBaseRow?.value || 'https://api.telegram.org'); }
    catch { return c.text('Telegram Bot API address is invalid', 503); }
    if (apiBase.protocol !== 'https:') return c.text('Telegram Bot API address must use HTTPS', 503);
    apiBase.pathname = apiBase.pathname.replace(/\/+$/, '');
    let filePath = '';
    for (let attempt = 0; attempt < 3 && !filePath; attempt += 1) {
      try {
        const fileInfoUrl = new URL(`${apiBase.pathname}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, apiBase.origin);
        const info = await fetch(fileInfoUrl, { signal: AbortSignal.timeout(9000) });
        const result = await info.json().catch(() => ({})) as { ok?: boolean; result?: { file_path?: string } };
        if (info.ok && result.ok && result.result?.file_path) filePath = result.result.file_path;
      } catch { /* Retry transient Telegram getFile failures below. */ }
      if (!filePath && attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    if (!filePath) return c.text('Telegram file is temporarily unavailable', 502);
    const downloadUrl = new URL(`${apiBase.pathname}/file/bot${token}/${filePath}`, apiBase.origin);
    const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!download?.ok || !download.body) return c.text('Telegram file download failed', 502);
    const headers = new Headers({
      'Content-Type': asset.content_type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    const length = download.headers.get('content-length');
    if (length && Number(length) <= 10 * 1024 * 1024) headers.set('Content-Length', length);
    return new Response(download.body, { headers });
  }
  if (!c.env.MEDIA_BUCKET) return c.text('Media storage is not configured', 404);
  const object = await c.env.MEDIA_BUCKET.get(key);
  if (!object) return c.text('Media not found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
});

// 5. 静态资源与页面回退处理 (Cloudflare Workers Static Assets)
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    // 针对根路径或特定路由映射
    if (pathname === '/' || pathname === '/index.html') {
      return await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw));
    }
    if (pathname === '/admin' || pathname === '/admin/') {
      return await c.env.ASSETS.fetch(new Request(new URL('/admin/index.html', c.req.url), c.req.raw));
    }

    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status !== 404) {
      return res;
    }
  }

  // 默认欢迎 / 状态响应
  return c.text('MacCMS Cloudflare Serverless Engine is running. Visit /admin for Dashboard.', 200);
});

// 导出 Cloudflare Worker 标准模块规范
export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger 定时触发器处理器
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          await runDueCloudTasks(env);
          const nodes = await env.DB
            .prepare('SELECT * FROM collect_node WHERE status = 1')
            .all<CollectNodeItem>();

          for (const node of nodes.results || []) {
            try {
              const configuredHours = node.cron_hours !== undefined ? node.cron_hours : 24;
              const scheduleSeconds = Math.max(1, configuredHours || 24) * 3600;
              if (node.last_run_time && Math.floor(Date.now() / 1000) - node.last_run_time < scheduleSeconds) continue;
              const hours = configuredHours;
              await CollectorService.runCollectTask(env.DB, node, hours, 1);
            } catch (err) {
              console.error(`Scheduled ingestion failed for node ${node.name}:`, err);
            }
          }
        } catch (e) {
          console.error('Scheduled cron event error:', e);
        }
      })()
    );
  },
};
