// ========================================================
// MacCMS Cloudflare Serverless 主入口 (Worker + Pages + D1)
// ========================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, CollectNodeItem } from './types';
import { provideRouter } from './routes/provide';
import { apiRouter } from './routes/api';
import { adminRouter } from './routes/admin';
import { timmingRouter } from './routes/timming';
import { CollectorService } from './services/collector';

const app = new Hono<{ Bindings: Bindings }>();

// 启用全局 CORS 跨域支持 (方便小程序与三方前端对接)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// 1. 挂载 MacCMS 官方标准对外提供接口
// 兼容：/api.php/provide/vod/、/api.php/provide/art/ 与 /provide/
app.route('/api.php/provide/vod', provideRouter);
app.route('/api.php/provide/art', provideRouter);
app.route('/api.php/provide', provideRouter);
app.route('/provide/vod', provideRouter);
app.route('/provide/art', provideRouter);
app.route('/provide', provideRouter);

// 2. 挂载定时任务接口
// 兼容：/api.php/timming/index 与 /api/timming/index
app.route('/api.php/timming/index', timmingRouter);
app.route('/api.php/timming', timmingRouter);
app.route('/api/timming/index', timmingRouter);
app.route('/api/timming', timmingRouter);

// 3. 挂载现代 RESTful 前端 API
app.route('/api', apiRouter);

// 4. 挂载后台管理系统 API
app.route('/api/admin', adminRouter);

// 5. 静态资源与页面回退处理 (Cloudflare Workers Static Assets)
app.get('*', async (c) => {
  // 如果配置了 Cloudflare Workers 静态资产绑定 ASSETS
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
          // 增量同步近 24 小时更新数据
          const nodes = await env.DB
            .prepare('SELECT * FROM collect_node WHERE status = 1')
            .all<CollectNodeItem>();

          for (const node of nodes.results || []) {
            try {
              await CollectorService.runCollectTask(env.DB, node, node.cron_hours || 24, 1);
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
