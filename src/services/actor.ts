// ========================================================
// 明星演员与角色图谱服务 (Actor & Role)
// ========================================================

import type { ActorItem, RoleItem, VodItem } from '../types/index.ts';
import { MacPlayUrlParser } from '../utils/parser.ts';

export class ActorService {
  /**
   * 分页查询明星列表
   */
  static async queryActors(
    db: D1Database,
    opts: { page?: number; limit?: number; typeId?: number; letter?: string; wd?: string; area?: string } = {}
  ): Promise<{ list: ActorItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 18));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['a.actor_status = 1'];
    const params: any[] = [];

    if (opts.typeId && opts.typeId > 0) {
      conditions.push('a.type_id = ?');
      params.push(opts.typeId);
    }
    if (opts.letter && opts.letter.trim()) {
      conditions.push('a.actor_letter = ?');
      params.push(opts.letter.trim().toUpperCase());
    }
    if (opts.area && opts.area.trim()) {
      conditions.push('a.actor_area LIKE ?');
      params.push(`%${opts.area.trim()}%`);
    }
    if (opts.wd && opts.wd.trim()) {
      conditions.push('(a.actor_name LIKE ? OR a.actor_en LIKE ? OR a.actor_works LIKE ?)');
      const kw = `%${opts.wd.trim()}%`;
      params.push(kw, kw, kw);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM actor a ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db.prepare(`
      SELECT a.*, t.type_name
      FROM actor a
      LEFT JOIN type t ON a.type_id = t.type_id
      ${whereClause}
      ORDER BY a.actor_hits DESC, a.actor_id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<ActorItem>();

    return { list: rows.results || [], total, page, limit, pagecount };
  }

  /**
   * 获取明星详情，并关联其主演的影视作品
   */
  static async getActorDetail(
    db: D1Database,
    id: number
  ): Promise<(ActorItem & { vods: VodItem[]; roles: RoleItem[] }) | null> {
    const row = await db.prepare(`
      SELECT a.*, t.type_name
      FROM actor a
      LEFT JOIN type t ON a.type_id = t.type_id
      WHERE a.actor_id = ?
      LIMIT 1
    `).bind(id).first<ActorItem>();

    if (!row) return null;

    db.prepare('UPDATE actor SET actor_hits = actor_hits + 1 WHERE actor_id = ?').bind(id).run().catch(() => {});

    // 查该明星饰演的角色
    const roleRows = await db.prepare('SELECT * FROM role WHERE role_actor_id = ? OR role_actor_name = ? LIMIT 10')
      .bind(id, row.actor_name).all<RoleItem>();

    // 查该明星主演的影片
    const vodRows = await db.prepare(`
      SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_score, vod_douban_score, vod_year
      FROM vod
      WHERE vod_status = 1 AND (vod_actor LIKE ? OR vod_director LIKE ?)
      ORDER BY vod_hits DESC
      LIMIT 18
    `).bind(`%${row.actor_name}%`, `%${row.actor_name}%`).all<VodItem>();

    return {
      ...row,
      vods: vodRows.results || [],
      roles: roleRows.results || [],
    };
  }

  static async saveActor(db: D1Database, data: Partial<ActorItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.actor_letter || MacPlayUrlParser.getFirstLetter(data.actor_name || '');

    if (data.actor_id && data.actor_id > 0) {
      await db.prepare(`
        UPDATE actor SET
          type_id = ?, actor_name = ?, actor_en = ?, actor_letter = ?, actor_sex = ?,
          actor_color = ?, actor_status = ?, actor_lock = ?, actor_level = ?,
          actor_pic = ?, actor_blurb = ?, actor_remarks = ?, actor_area = ?,
          actor_height = ?, actor_weight = ?, actor_birthday = ?, actor_birtharea = ?,
          actor_blood = ?, actor_starsign = ?, actor_school = ?, actor_works = ?,
          actor_content = ?, actor_time = ?
        WHERE actor_id = ?
      `).bind(
        data.type_id || 0,
        data.actor_name || '',
        data.actor_en || '',
        letter,
        data.actor_sex || '男',
        data.actor_color || '',
        data.actor_status !== undefined ? data.actor_status : 1,
        data.actor_lock || 0,
        data.actor_level || 0,
        data.actor_pic || '',
        data.actor_blurb || '',
        data.actor_remarks || '',
        data.actor_area || '',
        data.actor_height || '',
        data.actor_weight || '',
        data.actor_birthday || '',
        data.actor_birtharea || '',
        data.actor_blood || '',
        data.actor_starsign || '',
        data.actor_school || '',
        data.actor_works || '',
        data.actor_content || '',
        now,
        data.actor_id
      ).run();
      return data.actor_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO actor (
          type_id, actor_name, actor_en, actor_letter, actor_sex, actor_color,
          actor_status, actor_lock, actor_level, actor_pic, actor_blurb,
          actor_remarks, actor_area, actor_height, actor_weight, actor_birthday,
          actor_birtharea, actor_blood, actor_starsign, actor_school, actor_works,
          actor_content, actor_hits, actor_time, actor_time_add
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 0, ?, ?
        )
      `).bind(
        data.type_id || 0,
        data.actor_name || '',
        data.actor_en || '',
        letter,
        data.actor_sex || '男',
        data.actor_color || '',
        data.actor_status !== undefined ? data.actor_status : 1,
        data.actor_lock || 0,
        data.actor_level || 0,
        data.actor_pic || '',
        data.actor_blurb || '',
        data.actor_remarks || '',
        data.actor_area || '',
        data.actor_height || '',
        data.actor_weight || '',
        data.actor_birthday || '',
        data.actor_birtharea || '',
        data.actor_blood || '',
        data.actor_starsign || '',
        data.actor_school || '',
        data.actor_works || '',
        data.actor_content || '',
        now,
        now
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteActor(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM actor WHERE actor_id = ?').bind(id).run();
    return true;
  }

  // ==========================================
  // 角色 (Role) 服务
  // ==========================================

  static async queryRoles(
    db: D1Database,
    opts: { page?: number; limit?: number; vodId?: number; actorId?: number; wd?: string } = {}
  ): Promise<{ list: RoleItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['r.role_status = 1'];
    const params: any[] = [];

    if (opts.vodId && opts.vodId > 0) {
      conditions.push('r.role_vod_id = ?');
      params.push(opts.vodId);
    }
    if (opts.actorId && opts.actorId > 0) {
      conditions.push('r.role_actor_id = ?');
      params.push(opts.actorId);
    }
    if (opts.wd && opts.wd.trim()) {
      conditions.push('(r.role_name LIKE ? OR r.role_actor_name LIKE ? OR r.role_vod_name LIKE ?)');
      const kw = `%${opts.wd.trim()}%`;
      params.push(kw, kw, kw);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM role r ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db.prepare(`
      SELECT * FROM role r
      ${whereClause}
      ORDER BY r.role_id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<RoleItem>();

    return { list: rows.results || [], total, page, limit, pagecount };
  }

  static async saveRole(db: D1Database, data: Partial<RoleItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.role_letter || MacPlayUrlParser.getFirstLetter(data.role_name || '');

    if (data.role_id && data.role_id > 0) {
      await db.prepare(`
        UPDATE role SET
          role_name = ?, role_en = ?, role_letter = ?, role_status = ?, role_lock = ?,
          role_level = ?, role_pic = ?, role_actor_name = ?, role_actor_id = ?,
          role_vod_name = ?, role_vod_id = ?, role_remarks = ?, role_content = ?, role_time = ?
        WHERE role_id = ?
      `).bind(
        data.role_name || '',
        data.role_en || '',
        letter,
        data.role_status !== undefined ? data.role_status : 1,
        data.role_lock || 0,
        data.role_level || 0,
        data.role_pic || '',
        data.role_actor_name || '',
        data.role_actor_id || 0,
        data.role_vod_name || '',
        data.role_vod_id || 0,
        data.role_remarks || '',
        data.role_content || '',
        now,
        data.role_id
      ).run();
      return data.role_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO role (
          role_name, role_en, role_letter, role_status, role_lock, role_level,
          role_pic, role_actor_name, role_actor_id, role_vod_name, role_vod_id,
          role_remarks, role_content, role_time, role_time_add
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).bind(
        data.role_name || '',
        data.role_en || '',
        letter,
        data.role_status !== undefined ? data.role_status : 1,
        data.role_lock || 0,
        data.role_level || 0,
        data.role_pic || '',
        data.role_actor_name || '',
        data.role_actor_id || 0,
        data.role_vod_name || '',
        data.role_vod_id || 0,
        data.role_remarks || '',
        data.role_content || '',
        now,
        now
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteRole(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM role WHERE role_id = ?').bind(id).run();
    return true;
  }
}
