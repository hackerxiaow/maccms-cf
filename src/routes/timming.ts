// ========================================================
// 定时任务调度与外部触发接口 (Timming API)
// 兼容 MacCMS 外部 Crontab 调用：/api.php/timming/index
// ========================================================

import { Hono } from 'hono';
import type { Bindings, CollectNodeItem } from '../types/index.ts';
import { CollectorService } from '../services/collector.ts';
import { VodService } from '../services/vod.ts';
import { AuthUtils } from '../utils/auth.ts';

export const timmingRouter = new Hono<{ Bindings: Bindings }>();

const handleTimming = async (c: any) => {
  const query = c.req.query();
  const db: D1Database = c.env.DB;

  // 读取配置的密钥 (若有)
  const configs = await VodService.getConfigs(db);
  const secretKey = configs.timming_key || '';

  // 管理员 Token 豁免
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const jwtSecret = c.env.JWT_SECRET || (configs.admin_pwd ? `MACCMS_${configs.admin_pwd.slice(0, 16)}` : 'MACCMS_CLOUDFLARE_EDGE_SECRET_2026');
  const adminCheck = token ? await AuthUtils.verifyToken(token, jwtSecret) : { valid: false };

  if (secretKey && query.key !== secretKey && !adminCheck.valid) {
    return c.json({ code: 403, msg: '密钥校验未通过 (timming_key 不匹配)' }, 403);
  }

  // 查出所有启用状态的采集节点 (或者指定 node_id)
  let sql = 'SELECT * FROM collect_node WHERE status = 1';
  const params: any[] = [];
  if (query.node_id) {
    sql += ' AND id = ?';
    params.push(parseInt(query.node_id, 10));
  }

  const nodes = await db.prepare(sql).bind(...params).all<CollectNodeItem>();

  const results: any[] = [];
  const hours = query.h !== undefined ? parseInt(query.h, 10) : 24;
  const targetPage = parseInt(query.pg || query.page || '1', 10);
  const maxPages = Math.min(5, Math.max(1, parseInt(query.max_pages || '1', 10)));

  for (const node of nodes.results || []) {
    try {
      let currentPage = targetPage;
      for (let p = 0; p < maxPages; p++) {
        const res = await CollectorService.runCollectTask(db, node, hours, currentPage);
        results.push(res);
        if (currentPage >= res.pagecount) break;
        currentPage++;
      }
    } catch (err) {
      results.push({
        nodeName: node.name,
        error: (err as Error).message,
      });
    }
  }

  return c.json({
    code: 0,
    msg: `定时任务执行完毕，共调度 ${results.length} 次分页采集`,
    data: results,
  });
};

timmingRouter.get('/index', handleTimming);
timmingRouter.get('/index/*', handleTimming);
timmingRouter.get('/', handleTimming);
timmingRouter.post('/index', handleTimming);
timmingRouter.post('/', handleTimming);
