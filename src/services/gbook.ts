// ========================================================
// 留言板与播放器报错服务 (Gbook & Error Report)
// ========================================================

import type { GbookItem } from '../types/index.ts';

export class GbookService {
  /**
   * 提交留言或播放报错
   */
  static async addGbook(
    db: D1Database,
    data: {
      mid?: number;
      rid?: number;
      name?: string;
      userId?: number;
      content: string;
      vodName?: string;
      playFrom?: string;
      playPart?: string;
      ip?: string;
    }
  ): Promise<number> {
    const content = (data.content || '').trim();
    if (!content) throw new Error('反馈内容不能为空');

    const name = (data.name || '').trim() || '影迷';
    const now = Math.floor(Date.now() / 1000);

    const res = await db.prepare(`
      INSERT INTO gbook (
        gbook_mid, gbook_rid, gbook_name, user_id, gbook_status, gbook_ip,
        gbook_time, gbook_content, vod_name, play_from, play_part
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.mid || 1,
      data.rid || 0,
      name,
      data.userId || 0,
      data.ip || '',
      now,
      content,
      data.vodName || '',
      data.playFrom || '',
      data.playPart || ''
    ).run();

    return Number(res.meta.last_row_id);
  }

  /**
   * 分页查询留言与报错
   */
  static async queryGbooks(
    db: D1Database,
    opts: { page?: number; limit?: number; status?: number } = {}
  ): Promise<{ list: GbookItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.status !== undefined && opts.status !== -1) {
      conditions.push('gbook_status = ?');
      params.push(opts.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM gbook ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db.prepare(`
      SELECT * FROM gbook
      ${whereClause}
      ORDER BY gbook_id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<GbookItem>();

    return { list: rows.results || [], total, page, limit, pagecount };
  }

  /**
   * 管理员回复留言
   */
  static async replyGbook(db: D1Database, id: number, reply: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE gbook SET
        gbook_reply = ?,
        gbook_reply_time = ?
      WHERE gbook_id = ?
    `).bind(reply.trim(), now, id).run();
    return true;
  }

  static async deleteGbook(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM gbook WHERE gbook_id = ?').bind(id).run();
    return true;
  }
}
