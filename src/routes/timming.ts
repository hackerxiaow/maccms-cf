// ========================================================
// 定时任务调度与外部触发接口 (Timming API)
// 兼容 MacCMS 外部 Crontab 调用：/api.php/timming/index
// ========================================================

import { Hono } from 'hono';
import { Bindings, CollectNodeItem } from '../types';
import { CollectorService } from '../services/collector';
import { VodService } from '../services/vod';

export const timmingRouter = new Hono<{ Bindings: Bindings }>();

const handleTimming = async (c: any) => {
  const query = c.req.query();
  const db: D1Database = c.env.DB;

  // 读取配置的密钥 (若有)
  const configs = await VodService.getConfigs(db);
  const secretKey = configs.timming_key || '';
  if (secretKey && query.key !== secretKey) {
    return c.json({ code: 403, msg: '密钥校验未通过' }, 403);
  }

  // 查出所有启用状态的采集节点
  const nodes = await db
    .prepare('SELECT * FROM collect_node WHERE status = 1')
    .all<CollectNodeItem>();

  const results: any[] = [];
  const hours = parseInt(query.h || '24', 10);

  for (const node of nodes.results || []) {
    try {
      const res = await CollectorService.runCollectTask(db, node, hours, 1);
      results.push(res);
    } catch (err) {
      results.push({
        nodeName: node.name,
        error: (err as Error).message,
      });
    }
  }

  return c.json({
    code: 0,
    msg: `定时任务执行完毕，共调度 ${results.length} 个采集节点`,
    data: results,
  });
};

timmingRouter.get('/index', handleTimming);
timmingRouter.get('/index/*', handleTimming);
timmingRouter.get('/', handleTimming);

