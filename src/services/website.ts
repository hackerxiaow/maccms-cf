import type { WebsiteItem } from '../types/index.ts';

type WebsiteQuery = {
  page?: number;
  limit?: number;
  typeId?: number;
  wd?: string;
  status?: number;
  ids?: number[];
};

function normalizeHttpUrl(value: unknown, required = false): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required) throw new Error('请填写有效的网址');
    return '';
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('网址必须包含 http:// 或 https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('网址只允许使用 http:// 或 https://');
  }
  return url.toString();
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class WebsiteService {
  static async query(db: D1Database, query: WebsiteQuery = {}) {
    const page = Math.max(1, toInt(query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(query.limit, 24)));
    const where: string[] = [];
    const values: (number | string)[] = [];

    if (query.status !== undefined) {
      where.push('w.website_status = ?');
      values.push(query.status);
    }
    if (query.typeId) {
      where.push('w.type_id = ?');
      values.push(query.typeId);
    }
    if (query.ids?.length) {
      where.push(`w.website_id IN (${query.ids.map(() => '?').join(',')})`);
      values.push(...query.ids);
    }
    const wd = String(query.wd ?? '').trim();
    if (wd) {
      where.push('(w.website_name LIKE ? OR w.website_sub LIKE ? OR w.website_url LIKE ?)');
      const pattern = `%${wd}%`;
      values.push(pattern, pattern, pattern);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await db.prepare(`SELECT COUNT(*) AS c FROM website w ${clause}`)
      .bind(...values)
      .first<{ c: number }>();
    const total = count?.c ?? 0;
    const list = await db.prepare(`
      SELECT w.*, t.type_name
      FROM website w
      LEFT JOIN type t ON t.type_id = w.type_id
      ${clause}
      ORDER BY w.website_level DESC, w.website_sort ASC, w.website_id DESC
      LIMIT ? OFFSET ?
    `).bind(...values, limit, (page - 1) * limit).all<WebsiteItem>();

    return {
      page,
      limit,
      total,
      pagecount: Math.max(1, Math.ceil(total / limit)),
      list: list.results || [],
    };
  }

  static async get(db: D1Database, id: number): Promise<WebsiteItem | null> {
    return db.prepare(`
      SELECT w.*, t.type_name
      FROM website w
      LEFT JOIN type t ON t.type_id = w.type_id
      WHERE w.website_id = ?
    `).bind(id).first<WebsiteItem>();
  }

  static async save(db: D1Database, body: Record<string, unknown>): Promise<number> {
    const id = toInt(body.website_id);
    const name = String(body.website_name ?? '').trim();
    if (!name) throw new Error('请填写网站名称');

    const url = normalizeHttpUrl(body.website_url, true);
    const jumpUrl = normalizeHttpUrl(body.website_jumpurl);
    const letter = String(body.website_letter ?? name.slice(0, 1)).trim().slice(0, 1).toUpperCase();
    const typeId = toInt(body.type_id);
    if (typeId > 0) {
      const type = await db.prepare('SELECT type_mid FROM type WHERE type_id = ?').bind(typeId).first<{ type_mid: number }>();
      if (!type || type.type_mid !== 11) throw new Error('网址分类必须属于 type_mid=11');
    }
    const fields = [
      typeId, name, String(body.website_sub ?? '').trim(),
      String(body.website_en ?? '').trim(), letter, url,
      String(body.website_pic ?? '').trim(), String(body.website_logo ?? '').trim(), jumpUrl,
      body.website_status === undefined ? 1 : (toInt(body.website_status) === 1 ? 1 : 0),
      toInt(body.website_sort), Math.min(9, Math.max(0, toInt(body.website_level))), Math.floor(Date.now() / 1000),
    ];

    if (id > 0) {
      await db.prepare(`
        UPDATE website SET
          type_id = ?, website_name = ?, website_sub = ?, website_en = ?, website_letter = ?,
          website_url = ?, website_pic = ?, website_logo = ?, website_jumpurl = ?,
          website_status = ?, website_sort = ?, website_level = ?, website_time = ?
        WHERE website_id = ?
      `).bind(...fields, id).run();
      return id;
    }

    const result = await db.prepare(`
      INSERT INTO website (
        type_id, website_name, website_sub, website_en, website_letter, website_url,
        website_pic, website_logo, website_jumpurl, website_status, website_sort,
        website_level, website_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...fields).run();
    return Number(result.meta.last_row_id || 0);
  }

  static async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM website WHERE website_id = ?').bind(id).run();
  }

  static async recordVisit(db: D1Database, id: number): Promise<string | null> {
    const website = await this.get(db, id);
    if (!website || website.website_status !== 1) return null;
    const destination = normalizeHttpUrl(website.website_jumpurl || website.website_url);
    await db.prepare('UPDATE website SET website_referer = website_referer + 1 WHERE website_id = ?')
      .bind(id).run();
    return destination;
  }
}
