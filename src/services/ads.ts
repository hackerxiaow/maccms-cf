// ========================================================
// 广告位管理服务 (Ads Service)
// ========================================================

import type { AdsItem } from '../types/index.ts';

export class AdsService {
  /**
   * 获取全站所有启用的广告位内容字典
   */
  static async getActiveAds(db: D1Database): Promise<Record<string, string>> {
    const rows = await db.prepare('SELECT ads_key, ads_content FROM ads WHERE ads_status = 1').all<AdsItem>();
    const res: Record<string, string> = {};
    for (const r of rows.results || []) {
      res[r.ads_key] = r.ads_content;
    }
    return res;
  }

  /**
   * 后台获取所有广告位列表
   */
  static async getAllAds(db: D1Database): Promise<AdsItem[]> {
    const rows = await db.prepare('SELECT * FROM ads ORDER BY ads_sort ASC, ads_id ASC').all<AdsItem>();
    return rows.results || [];
  }

  static async saveAd(db: D1Database, data: Partial<AdsItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    if (data.ads_id && data.ads_id > 0) {
      await db.prepare(`
        UPDATE ads SET
          ads_key = ?, ads_name = ?, ads_content = ?, ads_status = ?, ads_sort = ?, ads_time = ?
        WHERE ads_id = ?
      `).bind(
        data.ads_key || '',
        data.ads_name || '',
        data.ads_content || '',
        data.ads_status !== undefined ? data.ads_status : 1,
        data.ads_sort || 0,
        now,
        data.ads_id
      ).run();
      return data.ads_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO ads (ads_key, ads_name, ads_content, ads_status, ads_sort, ads_time)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        data.ads_key || '',
        data.ads_name || '',
        data.ads_content || '',
        data.ads_status !== undefined ? data.ads_status : 1,
        data.ads_sort || 0,
        now
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteAd(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM ads WHERE ads_id = ?').bind(id).run();
    return true;
  }
}
