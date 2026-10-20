// ========================================================
// MacCMS v10 漫画内容模型服务 (type_mid=12)
// ========================================================

import type { MangaItem } from '../types/index.ts';
import { MacPlayUrlParser } from '../utils/parser.ts';

type MangaQuery = { page?: number; limit?: number; typeId?: number; status?: number; wd?: string };

const integer = (value: unknown, fallback = 0): number => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};
const string = (value: unknown): string => String(value ?? '').trim();

const textFields = [
  'manga_name', 'manga_sub', 'manga_en', 'manga_letter', 'manga_color', 'manga_from',
  'manga_author', 'manga_tag', 'manga_class', 'manga_pic', 'manga_pic_thumb', 'manga_pic_slide',
  'manga_pic_screenshot', 'manga_blurb', 'manga_remarks', 'manga_jumpurl', 'manga_tpl',
  'manga_rel_manga', 'manga_rel_vod', 'manga_pwd', 'manga_pwd_url', 'manga_content',
  'manga_serial', 'manga_chapter_from', 'manga_chapter_url', 'manga_copyright_info',
] as const;
const integerFields = [
  'type_id', 'type_id_1', 'group_id', 'manga_status', 'manga_level', 'manga_lock',
  'manga_points', 'manga_points_detail', 'manga_total', 'manga_age_rating',
  'manga_orientation', 'manga_is_vip', 'manga_last_update_time',
] as const;

export class MangaService {
  static async query(db: D1Database, query: MangaQuery = {}) {
    const page = Math.max(1, integer(query.page, 1));
    const limit = Math.min(100, Math.max(1, integer(query.limit, 20)));
    const where: string[] = ['m.manga_recycle_time = 0'];
    const values: (number | string)[] = [];
    if (query.status !== undefined && query.status >= 0) {
      where.push('m.manga_status = ?');
      values.push(query.status);
    }
    if (query.typeId && query.typeId > 0) {
      where.push('m.type_id = ?');
      values.push(query.typeId);
    }
    const wd = string(query.wd);
    if (wd) {
      where.push('(m.manga_name LIKE ? OR m.manga_author LIKE ? OR m.manga_tag LIKE ?)');
      const pattern = `%${wd}%`;
      values.push(pattern, pattern, pattern);
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const count = await db.prepare(`SELECT COUNT(*) AS c FROM manga m ${clause}`)
      .bind(...values).first<{ c: number }>();
    const total = count?.c || 0;
    const rows = await db.prepare(`
      SELECT m.*, t.type_name
      FROM manga m LEFT JOIN type t ON t.type_id = m.type_id
      ${clause}
      ORDER BY m.manga_level DESC, m.manga_time DESC, m.manga_id DESC
      LIMIT ? OFFSET ?
    `).bind(...values, limit, (page - 1) * limit).all<MangaItem>();
    return { list: rows.results || [], total, page, limit, pagecount: Math.max(1, Math.ceil(total / limit)) };
  }

  static async get(db: D1Database, id: number): Promise<MangaItem | null> {
    return db.prepare(`
      SELECT m.*, t.type_name
      FROM manga m LEFT JOIN type t ON t.type_id = m.type_id
      WHERE m.manga_id = ?
    `).bind(id).first<MangaItem>();
  }

  static async save(db: D1Database, body: Record<string, unknown>): Promise<number> {
    const id = integer(body.manga_id);
    const name = string(body.manga_name);
    if (!name) throw new Error('请填写漫画名称');
    const typeId = integer(body.type_id);
    if (typeId > 0) {
      const type = await db.prepare('SELECT type_mid FROM type WHERE type_id = ?')
        .bind(typeId).first<{ type_mid: number }>();
      if (!type || type.type_mid !== 12) throw new Error('漫画分类必须属于 type_mid=12');
    }

    const now = Math.floor(Date.now() / 1000);
    const values: (number | string)[] = [];
    const columns = [...integerFields, ...textFields] as readonly string[];
    for (const key of columns) {
      if (key === 'type_id') values.push(typeId);
      else if (key === 'manga_name') values.push(name);
      else if (key === 'manga_letter') {
        values.push(string(body[key]) || MacPlayUrlParser.getFirstLetter(name));
      } else if ((integerFields as readonly string[]).includes(key)) {
        const fallback = key === 'manga_status' ? 1 : 0;
        const n = integer(body[key], fallback);
        values.push(key === 'manga_level' ? Math.min(9, Math.max(0, n)) : n);
      } else {
        values.push(string(body[key]));
      }
    }

    if (id > 0) {
      const set = columns.map((key) => `${key} = ?`).join(', ');
      await db.prepare(`UPDATE manga SET ${set}, manga_time = ? WHERE manga_id = ?`)
        .bind(...values, now, id).run();
      return id;
    }

    const insertColumns = [...columns, 'manga_time', 'manga_time_add'];
    const result = await db.prepare(`INSERT INTO manga (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`)
      .bind(...values, now, now).run();
    return Number(result.meta.last_row_id || 0);
  }

  static async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM manga WHERE manga_id = ?').bind(id).run();
  }
}
