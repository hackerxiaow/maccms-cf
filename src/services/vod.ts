// ========================================================
// 视频数据持久层与查询服务 (基于 Cloudflare D1 SQLite)
// 深度融合 MacCMS v8 经典能力与 MacCMS v10 全量功能
// ========================================================

import type {
  VodItem,
  TypeItem,
  PlayGroup,
  PlayerItem,
  DownerItem,
  ServerItem,
  ArtItem,
  TopicItem,
  CommentItem,
  LinkItem,
} from '../types/index.ts';
import { MacPlayUrlParser } from '../utils/parser.ts';

export interface VodQueryOptions {
  page?: number;
  limit?: number;
  typeId?: number;
  typePid?: number;
  year?: string;
  area?: string;
  wd?: string;
  letter?: string;
  by?: 'time' | 'hits' | 'score' | 'id' | 'hits_day' | 'hits_week' | 'hits_month' | 'time_add' | 'level' | 'rand';
  order?: 'desc' | 'asc';
  isEnd?: number;
  level?: number;
  lock?: number;
  hours?: number;
  ids?: number[];
  status?: number; // 默认 1
  vodClass?: string;  // 类型/分类标签 (vod_class)
  vodLang?: string;   // 语言
  version?: string;   // 版本
  state?: string;     // 资源状态
  tag?: string;       // 标签
  actor?: string;     // 主演精确匹配
  director?: string;  // 导演精确匹配
  weekday?: number;   // 星期筛选 (0=周日 1=周一 ... 6=周六)
  plotOnly?: boolean;  // 只查询已启用分集剧情的视频
}

export class VodService {
  /**
   * 分页多维度综合查询视频列表
   */
  static async queryVods(
    db: D1Database,
    opts: VodQueryOptions = {}
  ): Promise<{ list: VodItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    // 默认只查已审 (status=1)，管理员传 -1 查全部
    if (opts.status !== undefined && opts.status !== -1) {
      conditions.push('v.vod_status = ?');
      params.push(opts.status);
    } else if (opts.status === undefined) {
      conditions.push('v.vod_status = 1');
    }

    if (opts.lock !== undefined && opts.lock !== -1) {
      conditions.push('v.vod_lock = ?');
      params.push(opts.lock);
    }

    if (opts.level !== undefined && opts.level > 0) {
      conditions.push('v.vod_level = ?');
      params.push(opts.level);
    }

    if (opts.ids && opts.ids.length > 0) {
      const placeholders = opts.ids.map(() => '?').join(',');
      conditions.push(`v.vod_id IN (${placeholders})`);
      params.push(...opts.ids);
    }

    if (opts.plotOnly) {
      conditions.push('COALESCE(v.vod_plot, 0) > 0');
    }

    if (opts.typeId && opts.typeId > 0) {
      conditions.push('(v.type_id = ? OR v.type_id_1 = ?)');
      params.push(opts.typeId, opts.typeId);
    } else if (opts.typePid && opts.typePid > 0) {
      conditions.push('v.type_id_1 = ?');
      params.push(opts.typePid);
    }

    if (opts.year && opts.year.trim()) {
      conditions.push('v.vod_year = ?');
      params.push(opts.year.trim());
    }

    if (opts.area && opts.area.trim()) {
      conditions.push('v.vod_area LIKE ?');
      params.push(`%${opts.area.trim()}%`);
    }

    if (opts.letter && opts.letter.trim()) {
      conditions.push('v.vod_letter = ?');
      params.push(opts.letter.trim().toUpperCase());
    }

    if (opts.vodClass && opts.vodClass.trim()) {
      conditions.push('v.vod_class LIKE ?');
      params.push(`%${opts.vodClass.trim()}%`);
    }
    if (opts.vodLang && opts.vodLang.trim()) {
      conditions.push('v.vod_lang LIKE ?');
      params.push(`%${opts.vodLang.trim()}%`);
    }
    if (opts.version && opts.version.trim()) {
      conditions.push('v.vod_remarks LIKE ?');
      params.push(`%${opts.version.trim()}%`);
    }
    if (opts.state && opts.state.trim()) {
      conditions.push('v.vod_isend = ?');
      params.push(opts.state.trim() === '连载' ? 0 : 1);
    }
    if (opts.tag && opts.tag.trim()) {
      conditions.push('v.vod_tag LIKE ?');
      params.push(`%${opts.tag.trim()}%`);
    }
    if (opts.actor && opts.actor.trim()) {
      conditions.push('v.vod_actor LIKE ?');
      params.push(`%${opts.actor.trim()}%`);
    }
    if (opts.director && opts.director.trim()) {
      conditions.push('v.vod_director LIKE ?');
      params.push(`%${opts.director.trim()}%`);
    }

    if (opts.weekday !== undefined && !isNaN(opts.weekday)) {
      conditions.push("CAST(strftime('%w', datetime(v.vod_time, 'unixepoch')) AS INTEGER) = ?");
      params.push(opts.weekday);
    }

    if (opts.wd && opts.wd.trim()) {
      const kw = `%${opts.wd.trim()}%`;
      if (opts.plotOnly) {
        conditions.push('(v.vod_name LIKE ? OR v.vod_sub LIKE ? OR v.vod_actor LIKE ? OR v.vod_director LIKE ? OR v.vod_plot_name LIKE ? OR v.vod_plot_detail LIKE ?)');
        params.push(kw, kw, kw, kw, kw, kw);
      } else {
        conditions.push('(v.vod_name LIKE ? OR v.vod_sub LIKE ? OR v.vod_actor LIKE ? OR v.vod_director LIKE ?)');
        params.push(kw, kw, kw, kw);
      }
    }

    if (opts.isEnd !== undefined && opts.isEnd >= 0) {
      conditions.push('v.vod_isend = ?');
      params.push(opts.isEnd);
    }

    if (opts.hours && opts.hours > 0) {
      const minTimestamp = Math.floor(Date.now() / 1000) - opts.hours * 3600;
      conditions.push('v.vod_time >= ?');
      params.push(minTimestamp);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let sortColumn = 'vod_time';
    switch (opts.by) {
      case 'hits': sortColumn = 'vod_hits'; break;
      case 'hits_day': sortColumn = 'vod_hits_day'; break;
      case 'hits_week': sortColumn = 'vod_hits_week'; break;
      case 'hits_month': sortColumn = 'vod_hits_month'; break;
      case 'score': sortColumn = 'vod_score'; break;
      case 'id': sortColumn = 'vod_id'; break;
      case 'time_add': sortColumn = 'vod_time_add'; break;
      case 'level': sortColumn = 'vod_level'; break;
      case 'rand': sortColumn = 'RANDOM()'; break;
      default: sortColumn = 'vod_time';
    }

    const sortDir = opts.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countSql = `SELECT COUNT(*) as count FROM vod v ${whereClause}`;
    const countResult = await db.prepare(countSql).bind(...params).first<{ count: number }>();
    const total = countResult?.count || 0;
    const pagecount = Math.ceil(total / limit);

    const orderExpr = sortColumn === 'RANDOM()' ? 'RANDOM()' : `v.${sortColumn}`;
    const dataSql = `
      SELECT v.*, t.type_name
      FROM vod v
      LEFT JOIN type t ON v.type_id = t.type_id
      ${whereClause}
      ORDER BY ${orderExpr} ${sortDir}
      LIMIT ? OFFSET ?
    `;
    const rows = await db.prepare(dataSql).bind(...params, limit, offset).all<VodItem>();

    return {
      list: rows.results || [],
      total,
      page,
      limit,
      pagecount,
    };
  }

  /**
   * 根据 ID 查询视频详情，并返回结构化的播放列表，同时更新周期点击量
   */
  static async getVodDetail(
    db: D1Database,
    vodId: number,
    options: { publishedOnly?: boolean; countHit?: boolean } = {}
  ): Promise<(VodItem & { play_groups: PlayGroup[]; down_groups: PlayGroup[] }) | null> {
    const statusCondition = options.publishedOnly ? ' AND v.vod_status = 1' : '';
    const row = await db
      .prepare(`
        SELECT v.*, t.type_name
        FROM vod v
        LEFT JOIN type t ON v.type_id = t.type_id
        WHERE v.vod_id = ?${statusCondition}
        LIMIT 1
      `)
      .bind(vodId)
      .first<VodItem>();

    if (!row) return null;

    if (options.countHit) {
    // 自增并更新日/周/月点击量
    const now = Math.floor(Date.now() / 1000);
    const lastHitsTime = row.vod_time_hits || 0;
    const isNewDay = lastHitsTime > 0 && new Date(lastHitsTime * 1000).toDateString() !== new Date(now * 1000).toDateString();
    const hitsDay = isNewDay ? 1 : (row.vod_hits_day || 0) + 1;
    const hitsWeek = (row.vod_hits_week || 0) + 1;
    const hitsMonth = (row.vod_hits_month || 0) + 1;

    db.prepare(`
      UPDATE vod SET
        vod_hits = vod_hits + 1,
        vod_hits_day = ?,
        vod_hits_week = ?,
        vod_hits_month = ?,
        vod_time_hits = ?
      WHERE vod_id = ?
    `).bind(hitsDay, hitsWeek, hitsMonth, now, vodId).run().catch(() => {});
    }

    const play_groups = MacPlayUrlParser.parse(
      row.vod_play_from,
      row.vod_play_url,
      row.vod_play_server,
      row.vod_play_note
    );

    const down_groups = MacPlayUrlParser.parse(
      row.vod_down_from || '',
      row.vod_down_url || '',
      row.vod_down_server || '',
      row.vod_down_note || ''
    );

    return {
      ...row,
      play_groups,
      down_groups,
    };
  }

  /**
   * 获取 MacCMS 分集剧情详情。剧情名与正文按 $$$ 一一对应，页码从 1 开始。
   */
  static async getPlotDetail(
    db: D1Database,
    vodId: number,
    page = 1
  ): Promise<({ vod_id: number; vod_name: string; vod_pic: string; vod_year: string; vod_area: string; type_name?: string; vod_plot_name: string; vod_plot_detail: string } & {
    plot_list: Array<{ page: number; name: string; detail: string }>;
    current_plot: { page: number; name: string; detail: string };
    pagecount: number;
  }) | null> {
    const row = await db.prepare(`
      SELECT v.vod_id, v.vod_name, v.vod_pic, v.vod_year, v.vod_area,
        v.vod_plot, v.vod_plot_name, v.vod_plot_detail, t.type_name
      FROM vod v LEFT JOIN type t ON v.type_id = t.type_id
      WHERE v.vod_id = ? AND v.vod_status = 1 AND COALESCE(v.vod_plot, 0) > 0
      LIMIT 1
    `).bind(vodId).first<{ vod_id: number; vod_name: string; vod_pic: string; vod_year: string; vod_area: string; type_name?: string; vod_plot_name: string; vod_plot_detail: string }>();
    if (!row) return null;

    const names = String(row.vod_plot_name || '').split('$$$');
    const details = String(row.vod_plot_detail || '').split('$$$');
    const plot_list = names.map((name, index) => ({
      page: index + 1,
      name: name.trim() || `第 ${index + 1} 集`,
      detail: String(details[index] || '').trim(),
    })).filter((plot) => plot.name || plot.detail);
    if (!plot_list.length) return null;

    const safePage = Math.min(plot_list.length, Math.max(1, Math.floor(page) || 1));
    const current_plot = plot_list[safePage - 1];
    db.prepare('UPDATE vod SET vod_hits = vod_hits + 1 WHERE vod_id = ?').bind(vodId).run().catch(() => {});
    return { ...row, plot_list, current_plot, pagecount: plot_list.length };
  }

  /**
   * 搜索联想提示
   */
  static async getSuggestions(db: D1Database, wd: string, limit = 10): Promise<string[]> {
    if (!wd || !wd.trim()) return [];
    const rows = await db
      .prepare('SELECT vod_name FROM vod WHERE vod_name LIKE ? AND vod_status = 1 ORDER BY vod_hits DESC LIMIT ?')
      .bind(`%${wd.trim()}%`, limit)
      .all<{ vod_name: string }>();

    return (rows.results || []).map(r => r.vod_name);
  }

  /**
   * 获取所有分类树
   */
  static async getTypes(db: D1Database, mid?: number): Promise<TypeItem[]> {
    let sql = 'SELECT * FROM type WHERE type_status = 1';
    const params: any[] = [];
    if (mid !== undefined && mid > 0) {
      sql += ' AND type_mid = ?';
      params.push(mid);
    }
    sql += ' ORDER BY type_sort ASC, type_id ASC';

    const rows = await db.prepare(sql).bind(...params).all<TypeItem>();
    const all = rows.results || [];

    const topList: TypeItem[] = [];
    const childMap = new Map<number, TypeItem[]>();

    for (const item of all) {
      if (item.type_pid === 0) {
        topList.push({ ...item, children: [] });
      } else {
        if (!childMap.has(item.type_pid)) {
          childMap.set(item.type_pid, []);
        }
        childMap.get(item.type_pid)!.push(item);
      }
    }

    for (const top of topList) {
      top.children = childMap.get(top.type_id) || [];
    }

    return topList;
  }

  /**
   * 保存或更新分类
   */
  static async saveType(db: D1Database, data: Partial<TypeItem>): Promise<number> {
    if (data.type_id && data.type_id > 0) {
      await db.prepare(`
        UPDATE type SET
          type_name = ?, type_en = ?, type_sort = ?, type_mid = ?, type_pid = ?,
          type_status = ?, type_tpl = ?, type_tpl_list = ?, type_tpl_detail = ?,
          type_tpl_play = ?, type_tpl_down = ?, type_title = ?, type_key = ?,
          type_des = ?, type_logo = ?, type_pic = ?, type_extend = ?
        WHERE type_id = ?
      `).bind(
        data.type_name || '',
        data.type_en || '',
        data.type_sort || 0,
        data.type_mid || 1,
        data.type_pid || 0,
        data.type_status !== undefined ? data.type_status : 1,
        data.type_tpl || '',
        data.type_tpl_list || '',
        data.type_tpl_detail || '',
        data.type_tpl_play || '',
        data.type_tpl_down || '',
        data.type_title || '',
        data.type_key || '',
        data.type_des || '',
        data.type_logo || '',
        data.type_pic || '',
        data.type_extend || '',
        data.type_id
      ).run();
      return data.type_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO type (
          type_name, type_en, type_sort, type_mid, type_pid, type_status,
          type_tpl, type_tpl_list, type_tpl_detail, type_tpl_play, type_tpl_down,
          type_title, type_key, type_des, type_logo, type_pic, type_extend
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.type_name || '',
        data.type_en || '',
        data.type_sort || 0,
        data.type_mid || 1,
        data.type_pid || 0,
        data.type_status !== undefined ? data.type_status : 1,
        data.type_tpl || '',
        data.type_tpl_list || '',
        data.type_tpl_detail || '',
        data.type_tpl_play || '',
        data.type_tpl_down || '',
        data.type_title || '',
        data.type_key || '',
        data.type_des || '',
        data.type_logo || '',
        data.type_pic || '',
        data.type_extend || ''
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteType(db: D1Database, typeId: number): Promise<boolean> {
    await db.prepare('DELETE FROM type WHERE type_id = ?').bind(typeId).run();
    return true;
  }

  /**
   * 录入或更新单个视频 (持久化全部 30+ 项业务字段)
   */
  static async saveVod(db: D1Database, data: Partial<VodItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.vod_letter || MacPlayUrlParser.getFirstLetter(data.vod_name || '');

    if (data.vod_id && data.vod_id > 0) {
      await db
        .prepare(`
          UPDATE vod SET
            type_id = ?, type_id_1 = ?, vod_name = ?, vod_sub = ?, vod_en = ?,
            vod_status = ?, vod_letter = ?, vod_color = ?, vod_tag = ?, vod_class = ?,
            vod_pic = ?, vod_pic_thumb = ?, vod_pic_slide = ?, vod_pic_screenshot = ?,
            vod_actor = ?, vod_director = ?, vod_writer = ?, vod_behind = ?,
            vod_blurb = ?, vod_remarks = ?, vod_pubdate = ?, vod_total = ?, vod_serial = ?,
            vod_tv = ?, vod_weekday = ?, vod_area = ?, vod_lang = ?, vod_year = ?,
            vod_version = ?, vod_state = ?, vod_duration = ?, vod_author = ?, vod_jumpurl = ?,
            vod_tpl = ?, vod_tpl_play = ?, vod_tpl_down = ?, vod_isend = ?, vod_lock = ?,
            vod_level = ?, vod_copyright = ?, group_id = ?, vod_points = ?, vod_points_play = ?,
            vod_points_down = ?, vod_trysee = ?, vod_pwd = ?, vod_pwd_play = ?, vod_pwd_down = ?,
            vod_content = ?, vod_douban_id = ?, vod_douban_score = ?, vod_score = ?,
            vod_time = ?, vod_play_from = ?, vod_play_server = ?, vod_play_note = ?, vod_play_url = ?,
            vod_down_from = ?, vod_down_server = ?, vod_down_note = ?, vod_down_url = ?,
            vod_plot = ?, vod_plot_name = ?, vod_plot_detail = ?, vod_rel_vod = ?, vod_rel_art = ?
          WHERE vod_id = ?
        `)
        .bind(
          data.type_id || 0,
          data.type_id_1 || 0,
          data.vod_name || '',
          data.vod_sub || '',
          data.vod_en || '',
          data.vod_status !== undefined ? data.vod_status : 1,
          letter,
          data.vod_color || '',
          data.vod_tag || '',
          data.vod_class || '',
          data.vod_pic || '',
          data.vod_pic_thumb || '',
          data.vod_pic_slide || '',
          data.vod_pic_screenshot || '',
          data.vod_actor || '',
          data.vod_director || '',
          data.vod_writer || '',
          data.vod_behind || '',
          data.vod_blurb || '',
          data.vod_remarks || '',
          data.vod_pubdate || '',
          data.vod_total || 0,
          data.vod_serial || '',
          data.vod_tv || '',
          data.vod_weekday || 0,
          data.vod_area || '',
          data.vod_lang || '',
          data.vod_year || '',
          data.vod_version || '',
          data.vod_state || '',
          data.vod_duration || '',
          data.vod_author || '',
          data.vod_jumpurl || '',
          data.vod_tpl || '',
          data.vod_tpl_play || '',
          data.vod_tpl_down || '',
          data.vod_isend || 0,
          data.vod_lock || 0,
          data.vod_level || 0,
          data.vod_copyright || 0,
          data.group_id || 0,
          data.vod_points || 0,
          data.vod_points_play || 0,
          data.vod_points_down || 0,
          data.vod_trysee || 0,
          data.vod_pwd || '',
          data.vod_pwd_play || '',
          data.vod_pwd_down || '',
          data.vod_content || '',
          data.vod_douban_id || 0,
          data.vod_douban_score || 0.0,
          data.vod_score || 9.0,
          now,
          data.vod_play_from || '',
          data.vod_play_server || '',
          data.vod_play_note || '',
          data.vod_play_url || '',
          data.vod_down_from || '',
          data.vod_down_server || '',
          data.vod_down_note || '',
          data.vod_down_url || '',
          data.vod_plot || 0,
          data.vod_plot_name || '',
          data.vod_plot_detail || '',
          data.vod_rel_vod || '',
          data.vod_rel_art || '',
          data.vod_id
        )
        .run();
      return data.vod_id;
    } else {
      const res = await db
        .prepare(`
          INSERT INTO vod (
            type_id, type_id_1, vod_name, vod_sub, vod_en, vod_status,
            vod_letter, vod_color, vod_tag, vod_class, vod_pic, vod_pic_thumb,
            vod_pic_slide, vod_pic_screenshot, vod_actor, vod_director, vod_writer,
            vod_behind, vod_blurb, vod_remarks, vod_pubdate, vod_total, vod_serial,
            vod_tv, vod_weekday, vod_area, vod_lang, vod_year, vod_version, vod_state,
            vod_duration, vod_author, vod_jumpurl, vod_tpl, vod_tpl_play, vod_tpl_down,
            vod_isend, vod_lock, vod_level, vod_copyright, group_id, vod_points,
            vod_points_play, vod_points_down, vod_trysee, vod_pwd, vod_pwd_play, vod_pwd_down,
            vod_content, vod_douban_id, vod_douban_score, vod_score, vod_time, vod_time_add,
            vod_play_from, vod_play_server, vod_play_note, vod_play_url,
            vod_down_from, vod_down_server, vod_down_note, vod_down_url,
            vod_plot, vod_plot_name, vod_plot_detail, vod_rel_vod, vod_rel_art
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
        `)
        .bind(
          data.type_id || 0,
          data.type_id_1 || 0,
          data.vod_name || '',
          data.vod_sub || '',
          data.vod_en || '',
          data.vod_status !== undefined ? data.vod_status : 1,
          letter,
          data.vod_color || '',
          data.vod_tag || '',
          data.vod_class || '',
          data.vod_pic || '',
          data.vod_pic_thumb || '',
          data.vod_pic_slide || '',
          data.vod_pic_screenshot || '',
          data.vod_actor || '',
          data.vod_director || '',
          data.vod_writer || '',
          data.vod_behind || '',
          data.vod_blurb || '',
          data.vod_remarks || '',
          data.vod_pubdate || '',
          data.vod_total || 0,
          data.vod_serial || '',
          data.vod_tv || '',
          data.vod_weekday || 0,
          data.vod_area || '',
          data.vod_lang || '',
          data.vod_year || '',
          data.vod_version || '',
          data.vod_state || '',
          data.vod_duration || '',
          data.vod_author || '',
          data.vod_jumpurl || '',
          data.vod_tpl || '',
          data.vod_tpl_play || '',
          data.vod_tpl_down || '',
          data.vod_isend || 0,
          data.vod_lock || 0,
          data.vod_level || 0,
          data.vod_copyright || 0,
          data.group_id || 0,
          data.vod_points || 0,
          data.vod_points_play || 0,
          data.vod_points_down || 0,
          data.vod_trysee || 0,
          data.vod_pwd || '',
          data.vod_pwd_play || '',
          data.vod_pwd_down || '',
          data.vod_content || '',
          data.vod_douban_id || 0,
          data.vod_douban_score || 0.0,
          data.vod_score || 9.0,
          now,
          now,
          data.vod_play_from || '',
          data.vod_play_server || '',
          data.vod_play_note || '',
          data.vod_play_url || '',
          data.vod_down_from || '',
          data.vod_down_server || '',
          data.vod_down_note || '',
          data.vod_down_url || '',
          data.vod_plot || 0,
          data.vod_plot_name || '',
          data.vod_plot_detail || '',
          data.vod_rel_vod || '',
          data.vod_rel_art || ''
        )
        .run();

      return Number(res.meta.last_row_id);
    }
  }

  /**
   * 删除视频
   */
  static async deleteVod(db: D1Database, vodId: number): Promise<boolean> {
    await db.prepare('DELETE FROM vod WHERE vod_id = ?').bind(vodId).run();
    return true;
  }

  // ==========================================
  // MacCMS 批量运维操作函数
  // ==========================================

  static async batchAuditVods(db: D1Database, ids: number[], status: number): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.prepare(`UPDATE vod SET vod_status = ? WHERE vod_id IN (${placeholders})`).bind(status, ...ids).run();
    return res.meta.changes;
  }

  static async batchSetVodLevel(db: D1Database, ids: number[], level: number): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.prepare(`UPDATE vod SET vod_level = ? WHERE vod_id IN (${placeholders})`).bind(level, ...ids).run();
    return res.meta.changes;
  }

  static async batchSetVodLock(db: D1Database, ids: number[], lock: number): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.prepare(`UPDATE vod SET vod_lock = ? WHERE vod_id IN (${placeholders})`).bind(lock, ...ids).run();
    return res.meta.changes;
  }

  static async batchTransferVodType(db: D1Database, ids: number[], targetTypeId: number): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const typeRow = await db.prepare('SELECT type_pid FROM type WHERE type_id = ?').bind(targetTypeId).first<{ type_pid: number }>();
    const typeId1 = typeRow?.type_pid === 0 ? targetTypeId : (typeRow?.type_pid || targetTypeId);
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.prepare(`UPDATE vod SET type_id = ?, type_id_1 = ? WHERE vod_id IN (${placeholders})`).bind(targetTypeId, typeId1, ...ids).run();
    return res.meta.changes;
  }

  static async batchDeleteVods(db: D1Database, ids: number[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.prepare(`DELETE FROM vod WHERE vod_id IN (${placeholders})`).bind(...ids).run();
    return res.meta.changes;
  }

  // ==========================================
  // MacCMS 重名检测与合并
  // ==========================================

  static async checkRepeatVods(db: D1Database): Promise<{ name: string; count: number; ids: number[] }[]> {
    const rows = await db.prepare(`
      SELECT vod_name, COUNT(*) as c, GROUP_CONCAT(vod_id) as id_list
      FROM vod
      GROUP BY vod_name
      HAVING c > 1
      ORDER BY c DESC
      LIMIT 100
    `).all<{ vod_name: string; c: number; id_list: string }>();

    return (rows.results || []).map(r => ({
      name: r.vod_name,
      count: r.c,
      ids: (r.id_list || '').split(',').map(Number).filter(Boolean),
    }));
  }

  static async mergeRepeatVods(db: D1Database, masterId: number, targetIds: number[]): Promise<{ merged: number }> {
    const master = await db.prepare('SELECT * FROM vod WHERE vod_id = ?').bind(masterId).first<VodItem>();
    if (!master) throw new Error('主视频不存在');

    let currentGroups = MacPlayUrlParser.parse(
      master.vod_play_from,
      master.vod_play_url,
      master.vod_play_server,
      master.vod_play_note
    );

    const validTargetIds = targetIds.filter(id => id !== masterId);
    if (validTargetIds.length === 0) return { merged: 0 };

    const placeholders = validTargetIds.map(() => '?').join(',');
    const targetRows = await db.prepare(`SELECT * FROM vod WHERE vod_id IN (${placeholders})`).bind(...validTargetIds).all<VodItem>();

    for (const t of targetRows.results || []) {
      const targetGroups = MacPlayUrlParser.parse(
        t.vod_play_from,
        t.vod_play_url,
        t.vod_play_server,
        t.vod_play_note
      );
      currentGroups = MacPlayUrlParser.mergeGroups(currentGroups, targetGroups);
    }

    const serialized = MacPlayUrlParser.serialize(currentGroups);
    const now = Math.floor(Date.now() / 1000);

    await db.prepare(`
      UPDATE vod SET
        vod_play_from = ?,
        vod_play_server = ?,
        vod_play_note = ?,
        vod_play_url = ?,
        vod_time = ?
      WHERE vod_id = ?
    `).bind(
      serialized.vod_play_from,
      serialized.vod_play_server,
      serialized.vod_play_note,
      serialized.vod_play_url,
      now,
      masterId
    ).run();

    await db.prepare(`DELETE FROM vod WHERE vod_id IN (${placeholders})`).bind(...validTargetIds).run();
    return { merged: validTargetIds.length };
  }

  // ==========================================
  // MacCMS 数据库全局字符批量替换
  // ==========================================

  static async replaceDatabaseString(
    db: D1Database,
    table: string,
    column: string,
    searchStr: string,
    replaceStr: string
  ): Promise<number> {
    const allowedTables: Record<string, string[]> = {
      vod: ['vod_name', 'vod_sub', 'vod_actor', 'vod_director', 'vod_writer', 'vod_pic', 'vod_pic_slide', 'vod_blurb', 'vod_content', 'vod_play_url', 'vod_down_url', 'vod_jumpurl'],
      art: ['art_name', 'art_sub', 'art_pic', 'art_author', 'art_from', 'art_blurb', 'art_content'],
      topic: ['topic_name', 'topic_pic', 'topic_blurb', 'topic_content'],
      actor: ['actor_name', 'actor_pic', 'actor_blurb', 'actor_content', 'actor_works'],
      role: ['role_name', 'role_pic', 'role_content'],
      player: ['parse_url', 'player_parse2'],
      manga: ['manga_name', 'manga_pic', 'manga_pic_thumb', 'manga_pic_slide', 'manga_pic_screenshot', 'manga_chapter_url', 'manga_content'],
      website: ['website_name', 'website_url', 'website_pic', 'website_logo', 'website_jumpurl'],
    };

    if (!allowedTables[table] || !allowedTables[table].includes(column)) {
      throw new Error(`不允许在表 ${table} 的字段 ${column} 上执行替换`);
    }

    const sql = `UPDATE ${table} SET ${column} = REPLACE(${column}, ?, ?) WHERE ${column} LIKE ?`;
    const res = await db.prepare(sql).bind(searchStr, replaceStr, `%${searchStr}%`).run();
    return res.meta.changes;
  }

  // ==========================================
  // 顶/踩 与评分交互
  // ==========================================

  static async diggVod(db: D1Database, vodId: number, type: 'up' | 'down'): Promise<{ up: number; down: number }> {
    const col = type === 'up' ? 'vod_up' : 'vod_down';
    await db.prepare(`UPDATE vod SET ${col} = ${col} + 1 WHERE vod_id = ?`).bind(vodId).run();
    const row = await db.prepare('SELECT vod_up, vod_down FROM vod WHERE vod_id = ?').bind(vodId).first<{ vod_up: number; vod_down: number }>();
    return { up: row?.vod_up || 0, down: row?.vod_down || 0 };
  }

  static async scoreVod(db: D1Database, vodId: number, score: number): Promise<{ score: number; score_num: number }> {
    const validScore = Math.max(1, Math.min(10, score));
    await db.prepare(`
      UPDATE vod SET
        vod_score_all = vod_score_all + ?,
        vod_score_num = vod_score_num + 1,
        vod_score = ROUND((vod_score_all + ?) / (vod_score_num + 1), 1)
      WHERE vod_id = ?
    `).bind(validScore, validScore, vodId).run();

    const row = await db.prepare('SELECT vod_score, vod_score_num FROM vod WHERE vod_id = ?').bind(vodId).first<{ vod_score: number; vod_score_num: number }>();
    return { score: row?.vod_score || 9.0, score_num: row?.vod_score_num || 1 };
  }

  /**
   * 获取所有系统全局配置
   */
  static async getConfigs(db: D1Database, hostname = ''): Promise<Record<string, string>> {
    const rows = await db.prepare('SELECT key, value FROM config').all<{ key: string; value: string }>();
    const result: Record<string, string> = {};
    for (const r of rows.results || []) {
      result[r.key] = r.value;
    }
    const host = String(hostname || '').trim().toLowerCase().replace(/:\d+$/, '');
    if (host && !['localhost', '127.0.0.1'].includes(host)) {
      const site = await db.prepare(`SELECT site_name,site_url,site_keywords,site_description FROM site_host_config
        WHERE hostname=? AND status=1 LIMIT 1`).bind(host).first<{ site_name: string; site_url: string; site_keywords: string; site_description: string }>().catch(() => null);
      if (site) {
        for (const key of ['site_name','site_url','site_keywords','site_description'] as const) if (site[key]) result[key] = site[key];
      }
    }
    return result;
  }

  /**
   * 更新全局配置
   */
  static async setConfig(db: D1Database, key: string, value: string): Promise<void> {
    await db
      .prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .bind(key, value, value)
      .run();
  }

  /**
   * 获取巨幕轮播推荐视频 (Banner Spotlight)
   */
  static async getBannerVods(db: D1Database, limit = 9): Promise<VodItem[]> {
    const rows = await db
      .prepare(`
        SELECT v.*, t.type_name
        FROM vod v
        LEFT JOIN type t ON v.type_id = t.type_id
        WHERE v.vod_status = 1
        ORDER BY v.vod_level DESC, v.vod_hits DESC, v.vod_time DESC
        LIMIT ?
      `)
      .bind(limit)
      .all<VodItem>();
    return rows.results || [];
  }

  /**
   * 获取影视榜单排行榜 (今日热播榜、周热播榜、口碑高分榜)
   */
  static async getRankings(db: D1Database, limit = 10): Promise<{
    hotToday: VodItem[];
    hotWeek: VodItem[];
    topScore: VodItem[];
  }> {
    const [hotToday, hotWeek, topScore] = await Promise.all([
      db.prepare('SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_hits, vod_score, vod_douban_score FROM vod WHERE vod_status = 1 ORDER BY vod_hits_day DESC, vod_hits DESC LIMIT ?').bind(limit).all<VodItem>(),
      db.prepare('SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_hits, vod_score, vod_douban_score FROM vod WHERE vod_status = 1 ORDER BY vod_hits_week DESC, vod_hits DESC LIMIT ?').bind(limit).all<VodItem>(),
      db.prepare('SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_hits, vod_score, vod_douban_score FROM vod WHERE vod_status = 1 ORDER BY vod_douban_score DESC, vod_score DESC LIMIT ?').bind(limit).all<VodItem>(),
    ]);

    return {
      hotToday: hotToday.results || [],
      hotWeek: hotWeek.results || [],
      topScore: topScore.results || [],
    };
  }

  // ==========================================
  // 文章资讯 (Art) 服务
  // ==========================================
  static async queryArts(
    db: D1Database,
    opts: { page?: number; limit?: number; typeId?: number; wd?: string; status?: number } = {}
  ): Promise<{ list: ArtItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 15));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    // Public callers omit status and see published content; admin may pass -1 for all states.
    const status = opts.status === undefined ? 1 : opts.status;
    if (status >= 0) {
      conditions.push('a.art_status = ?');
      params.push(status);
    }

    if (opts.typeId && opts.typeId > 0) {
      conditions.push('(a.type_id = ? OR a.type_id_1 = ?)');
      params.push(opts.typeId, opts.typeId);
    }
    if (opts.wd && opts.wd.trim()) {
      conditions.push('(a.art_name LIKE ? OR a.art_blurb LIKE ?)');
      params.push(`%${opts.wd.trim()}%`, `%${opts.wd.trim()}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM art a ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db
      .prepare(`SELECT a.*, t.type_name FROM art a LEFT JOIN type t ON a.type_id = t.type_id ${whereClause} ORDER BY a.art_time DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all<ArtItem>();

    return {
      list: rows.results || [],
      total,
      page,
      limit,
      pagecount,
    };
  }

  static async getArtDetail(db: D1Database, id: number, publishedOnly = false): Promise<ArtItem | null> {
    const statusCondition = publishedOnly ? ' AND a.art_status = 1' : '';
    const row = await db
      .prepare(`SELECT a.*, t.type_name FROM art a LEFT JOIN type t ON a.type_id = t.type_id WHERE a.art_id = ?${statusCondition} LIMIT 1`)
      .bind(id)
      .first<ArtItem>();
    if (row) {
      db.prepare('UPDATE art SET art_hits = art_hits + 1 WHERE art_id = ?').bind(id).run().catch(() => {});
    }
    return row || null;
  }

  static async saveArt(db: D1Database, data: Partial<ArtItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.art_letter || MacPlayUrlParser.getFirstLetter(data.art_name || '');
    if (data.art_id && data.art_id > 0) {
      await db.prepare(`
        UPDATE art SET
          type_id = ?, type_id_1 = ?, group_id = ?, art_name = ?, art_sub = ?, art_en = ?,
          art_status = ?, art_letter = ?, art_color = ?, art_tag = ?, art_lock = ?,
          art_level = ?, art_pic = ?, art_pic_thumb = ?, art_pic_slide = ?,
          art_author = ?, art_from = ?, art_blurb = ?, art_content = ?,
          art_time = ?, art_rel_vod = ?, art_rel_art = ?, art_pwd = ?, art_points = ?
        WHERE art_id = ?
      `).bind(
        data.type_id || 0,
        data.type_id_1 || 0,
        data.group_id || 0,
        data.art_name || '',
        data.art_sub || '',
        data.art_en || '',
        data.art_status !== undefined ? data.art_status : 1,
        letter,
        data.art_color || '',
        data.art_tag || '',
        data.art_lock || 0,
        data.art_level || 0,
        data.art_pic || '',
        data.art_pic_thumb || '',
        data.art_pic_slide || '',
        data.art_author || '官方编辑',
        data.art_from || '本站原创',
        data.art_blurb || '',
        data.art_content || '',
        now,
        data.art_rel_vod || '',
        data.art_rel_art || '',
        data.art_pwd || '',
        data.art_points || 0,
        data.art_id
      ).run();
      return data.art_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO art (
          type_id, type_id_1, group_id, art_name, art_sub, art_en, art_status,
          art_letter, art_color, art_tag, art_lock, art_level, art_pic,
          art_pic_thumb, art_pic_slide, art_author, art_from, art_blurb,
          art_content, art_hits, art_time, art_time_add, art_rel_vod,
          art_rel_art, art_pwd, art_points
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 0, ?, ?, ?,
          ?, ?, ?
        )
      `).bind(
        data.type_id || 0,
        data.type_id_1 || 0,
        data.group_id || 0,
        data.art_name || '',
        data.art_sub || '',
        data.art_en || '',
        data.art_status !== undefined ? data.art_status : 1,
        letter,
        data.art_color || '',
        data.art_tag || '',
        data.art_lock || 0,
        data.art_level || 0,
        data.art_pic || '',
        data.art_pic_thumb || '',
        data.art_pic_slide || '',
        data.art_author || '官方编辑',
        data.art_from || '本站原创',
        data.art_blurb || '',
        data.art_content || '',
        now,
        now,
        data.art_rel_vod || '',
        data.art_rel_art || '',
        data.art_pwd || '',
        data.art_points || 0
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteArt(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM art WHERE art_id = ?').bind(id).run();
    return true;
  }

  // ==========================================
  // 影视专题 (Topic) 服务
  // ==========================================
  static async queryTopics(db: D1Database, includeHidden = false): Promise<TopicItem[]> {
    const rows = await db.prepare(
      includeHidden
        ? 'SELECT * FROM topic ORDER BY topic_sort ASC, topic_id DESC'
        : 'SELECT * FROM topic WHERE topic_status = 1 ORDER BY topic_sort ASC, topic_id DESC'
    ).all<TopicItem>();
    return rows.results || [];
  }

  static async getTopicDetail(db: D1Database, id: number, publishedOnly = false): Promise<(TopicItem & { vods: VodItem[] }) | null> {
    const statusCondition = publishedOnly ? ' AND topic_status = 1' : '';
    const row = await db.prepare(`SELECT * FROM topic WHERE topic_id = ?${statusCondition} LIMIT 1`).bind(id).first<TopicItem>();
    if (!row) return null;

    db.prepare('UPDATE topic SET topic_hits = topic_hits + 1 WHERE topic_id = ?').bind(id).run().catch(() => {});

    let vods: VodItem[] = [];
    if (row.topic_rel_vod && row.topic_rel_vod.trim()) {
      const ids = row.topic_rel_vod.split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const vRows = await db.prepare(`SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_score, vod_douban_score FROM vod WHERE vod_status = 1 AND vod_id IN (${placeholders})`).bind(...ids).all<VodItem>();
        vods = vRows.results || [];
      }
    }

    return {
      ...row,
      vods,
    };
  }

  static async saveTopic(db: D1Database, data: Partial<TopicItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.topic_letter || MacPlayUrlParser.getFirstLetter(data.topic_name || '');

    if (data.topic_id && data.topic_id > 0) {
      await db.prepare(`
        UPDATE topic SET
          topic_name = ?, topic_sub = ?, topic_en = ?, topic_letter = ?, topic_color = ?,
          topic_tpl = ?, topic_pic = ?, topic_pic_thumb = ?, topic_pic_slide = ?,
          topic_blurb = ?, topic_content = ?, topic_status = ?, topic_sort = ?,
          topic_level = ?, topic_rel_vod = ?, topic_rel_art = ?, topic_extend = ?,
          topic_time = ?
        WHERE topic_id = ?
      `).bind(
        data.topic_name || '',
        data.topic_sub || '',
        data.topic_en || '',
        letter,
        data.topic_color || '',
        data.topic_tpl || '',
        data.topic_pic || '',
        data.topic_pic_thumb || '',
        data.topic_pic_slide || '',
        data.topic_blurb || '',
        data.topic_content || '',
        data.topic_status !== undefined ? data.topic_status : 1,
        data.topic_sort || 0,
        data.topic_level || 0,
        data.topic_rel_vod || '',
        data.topic_rel_art || '',
        data.topic_extend || '',
        now,
        data.topic_id
      ).run();
      return data.topic_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO topic (
          topic_name, topic_sub, topic_en, topic_letter, topic_color,
          topic_tpl, topic_pic, topic_pic_thumb, topic_pic_slide,
          topic_blurb, topic_content, topic_status, topic_sort,
          topic_level, topic_rel_vod, topic_rel_art, topic_extend,
          topic_time, topic_time_add
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `).bind(
        data.topic_name || '',
        data.topic_sub || '',
        data.topic_en || '',
        letter,
        data.topic_color || '',
        data.topic_tpl || '',
        data.topic_pic || '',
        data.topic_pic_thumb || '',
        data.topic_pic_slide || '',
        data.topic_blurb || '',
        data.topic_content || '',
        data.topic_status !== undefined ? data.topic_status : 1,
        data.topic_sort || 0,
        data.topic_level || 0,
        data.topic_rel_vod || '',
        data.topic_rel_art || '',
        data.topic_extend || '',
        now,
        now
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteTopic(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM topic WHERE topic_id = ?').bind(id).run();
    return true;
  }

  // ==========================================
  // 用户互动评论与留言 (Comment)
  // ==========================================
  static async getComments(db: D1Database, mid: number, rid: number, limit = 50): Promise<CommentItem[]> {
    const rows = await db
      .prepare('SELECT * FROM comment WHERE comment_mid = ? AND comment_rid = ? AND comment_status = 1 ORDER BY comment_id DESC LIMIT ?')
      .bind(mid, rid, limit)
      .all<CommentItem>();
    return rows.results || [];
  }

  static async addComment(db: D1Database, data: { mid: number; rid: number; pid?: number; userId?: number; name?: string; ip?: string; content: string; status?: number }): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const name = (data.name || '').trim() || '热心影迷';
    const content = (data.content || '').trim();
    if (!content) throw new Error('评论内容不能为空');

    const res = await db
      .prepare('INSERT INTO comment (comment_mid, comment_rid, comment_pid, user_id, comment_name, comment_ip, comment_content, comment_time, comment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.mid, data.rid, data.pid || 0, data.userId || 0, name, data.ip || '', content, now, data.status === 0 ? 0 : 1)
      .run();
    return Number(res.meta.last_row_id);
  }

  // ==========================================
  // 友情链接 (Link)
  // ==========================================
  static async getLinks(db: D1Database): Promise<LinkItem[]> {
    const rows = await db.prepare('SELECT * FROM link WHERE link_status = 1 ORDER BY link_sort ASC, link_id ASC').all<LinkItem>();
    return rows.results || [];
  }

  static async saveLink(db: D1Database, data: Partial<LinkItem>): Promise<number> {
    if (data.link_id && data.link_id > 0) {
      await db.prepare(`
        UPDATE link SET
          link_name = ?, link_url = ?, link_logo = ?, link_type = ?, link_sort = ?, link_status = ?
        WHERE link_id = ?
      `).bind(
        data.link_name || '',
        data.link_url || '',
        data.link_logo || '',
        data.link_type || 0,
        data.link_sort || 0,
        data.link_status !== undefined ? data.link_status : 1,
        data.link_id
      ).run();
      return data.link_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO link (link_name, link_url, link_logo, link_type, link_sort, link_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        data.link_name || '',
        data.link_url || '',
        data.link_logo || '',
        data.link_type || 0,
        data.link_sort || 0,
        data.link_status !== undefined ? data.link_status : 1
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteLink(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM link WHERE link_id = ?').bind(id).run();
    return true;
  }

  // ==========================================
  // 播放器、下载器与服务器管理
  // ==========================================
  static async getPlayers(db: D1Database): Promise<PlayerItem[]> {
    const rows = await db
      .prepare('SELECT * FROM player WHERE status = 1 ORDER BY sort ASC, id ASC')
      .all<PlayerItem>();
    return rows.results || [];
  }

  static async getAllPlayers(db: D1Database): Promise<PlayerItem[]> {
    const rows = await db.prepare('SELECT * FROM player ORDER BY sort ASC, id ASC').all<PlayerItem>();
    return rows.results || [];
  }

  static async savePlayer(db: D1Database, data: Partial<PlayerItem>): Promise<number> {
    if (data.id && data.id > 0) {
      await db.prepare(`
        UPDATE player SET
          code = ?, name = ?, player_title = ?, parse_url = ?, player_parse2 = ?,
          player_target = ?, player_content = ?, player_url = ?, status = ?, sort = ?, tip = ?
        WHERE id = ?
      `).bind(
        data.code || '',
        data.name || '',
        data.player_title || '',
        data.parse_url || '',
        data.player_parse2 || '',
        data.player_target || '_self',
        data.player_content || '',
        data.player_url || '',
        data.status !== undefined ? data.status : 1,
        data.sort || 0,
        data.tip || '',
        data.id
      ).run();
      return data.id;
    } else {
      const res = await db.prepare(`
        INSERT INTO player (
          code, name, player_title, parse_url, player_parse2, player_target,
          player_content, player_url, status, sort, tip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.code || '',
        data.name || '',
        data.player_title || '',
        data.parse_url || '',
        data.player_parse2 || '',
        data.player_target || '_self',
        data.player_content || '',
        data.player_url || '',
        data.status !== undefined ? data.status : 1,
        data.sort || 0,
        data.tip || ''
      ).run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deletePlayer(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM player WHERE id = ?').bind(id).run();
    return true;
  }

  static async getDowners(db: D1Database): Promise<DownerItem[]> {
    const rows = await db.prepare('SELECT * FROM downer ORDER BY sort ASC, id ASC').all<DownerItem>();
    return rows.results || [];
  }

  static async saveDowner(db: D1Database, data: Partial<DownerItem>): Promise<number> {
    if (data.id && data.id > 0) {
      await db.prepare('UPDATE downer SET code = ?, name = ?, status = ?, sort = ?, tip = ? WHERE id = ?')
        .bind(data.code || '', data.name || '', data.status !== undefined ? data.status : 1, data.sort || 0, data.tip || '', data.id).run();
      return data.id;
    } else {
      const res = await db.prepare('INSERT INTO downer (code, name, status, sort, tip) VALUES (?, ?, ?, ?, ?)')
        .bind(data.code || '', data.name || '', data.status !== undefined ? data.status : 1, data.sort || 0, data.tip || '').run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteDowner(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM downer WHERE id = ?').bind(id).run();
    return true;
  }

  static async getServers(db: D1Database): Promise<ServerItem[]> {
    const rows = await db.prepare('SELECT * FROM server ORDER BY sort ASC, id ASC').all<ServerItem>();
    return rows.results || [];
  }

  static async saveServer(db: D1Database, data: Partial<ServerItem>): Promise<number> {
    if (data.id && data.id > 0) {
      await db.prepare('UPDATE server SET code = ?, name = ?, status = ?, sort = ?, tip = ? WHERE id = ?')
        .bind(data.code || '', data.name || '', data.status !== undefined ? data.status : 1, data.sort || 0, data.tip || '', data.id).run();
      return data.id;
    } else {
      const res = await db.prepare('INSERT INTO server (code, name, status, sort, tip) VALUES (?, ?, ?, ?, ?)')
        .bind(data.code || '', data.name || '', data.status !== undefined ? data.status : 1, data.sort || 0, data.tip || '').run();
      return Number(res.meta.last_row_id);
    }
  }

  static async deleteServer(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM server WHERE id = ?').bind(id).run();
    return true;
  }
}
