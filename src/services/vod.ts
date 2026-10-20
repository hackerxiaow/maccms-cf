// ========================================================
// 视频数据持久层与查询服务 (基于 Cloudflare D1 SQLite)
// ========================================================

import type { VodItem, TypeItem, PlayGroup, PlayerItem, ArtItem, TopicItem, CommentItem, LinkItem } from '../types/index.ts';
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
  by?: 'time' | 'hits' | 'score' | 'id' | 'hits_day' | 'hits_week' | 'hits_month' | 'time_add' | 'rand';
  order?: 'desc' | 'asc';
  isEnd?: number;
  hours?: number;
  ids?: number[];
  status?: number; // 默认 1
  /** 海螺主题筛选维度 */
  vodClass?: string;  // 类型/分类标签 (vod_class)
  vodLang?: string;  // 语言
  version?: string;  // 版本
  state?: string;    // 资源状态
  tag?: string;      // 标签
  actor?: string;    // 主演精确匹配
  director?: string; // 导演精确匹配
  weekday?: number;  // 星期筛选 (0=周日 1=周一 ... 6=周六)
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

    // 默认只查已审 (status=1)，管理员可传 -1 查全部
    if (opts.status !== undefined && opts.status !== -1) {
      conditions.push('v.vod_status = ?');
      params.push(opts.status);
    } else if (opts.status === undefined) {
      conditions.push('v.vod_status = 1');
    }

    if (opts.ids && opts.ids.length > 0) {
      const placeholders = opts.ids.map(() => '?').join(',');
      conditions.push(`v.vod_id IN (${placeholders})`);
      params.push(...opts.ids);
    }

    if (opts.typeId && opts.typeId > 0) {
      // 包含当前分类或顶级分类关联
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

    // 海螺主题筛选维度：类型/语言/版本/资源/标签
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
      conditions.push('(v.vod_name LIKE ? OR v.vod_sub LIKE ? OR v.vod_actor LIKE ? OR v.vod_director LIKE ?)');
      params.push(kw, kw, kw, kw);
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

    // 排序字段映射
    let sortColumn = 'v.vod_time';
    switch (opts.by) {
      case 'hits': sortColumn = 'vod_hits'; break;
      case 'hits_day': sortColumn = 'vod_hits_day'; break;
      case 'hits_week': sortColumn = 'vod_hits_week'; break;
      case 'hits_month': sortColumn = 'vod_hits_month'; break;
      case 'score': sortColumn = 'vod_score'; break;
      case 'id': sortColumn = 'vod_id'; break;
      case 'time_add': sortColumn = 'vod_time_add'; break;
      case 'rand': sortColumn = 'RANDOM()'; break;
      default: sortColumn = 'vod_time';
    }

    const sortDir = opts.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // 查总数
    const countSql = `SELECT COUNT(*) as count FROM vod v ${whereClause}`;
    const countResult = await db.prepare(countSql).bind(...params).first<{ count: number }>();
    const total = countResult?.count || 0;
    const pagecount = Math.ceil(total / limit);

    // 查分页数据
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
   * 根据 ID 查询视频详情，并返回结构化的播放列表
   */
  static async getVodDetail(
    db: D1Database,
    vodId: number
  ): Promise<(VodItem & { play_groups: PlayGroup[] }) | null> {
    const row = await db
      .prepare(`
        SELECT v.*, t.type_name
        FROM vod v
        LEFT JOIN type t ON v.type_id = t.type_id
        WHERE v.vod_id = ?
        LIMIT 1
      `)
      .bind(vodId)
      .first<VodItem>();

    if (!row) return null;

    // 自增一次点击量
    db.prepare('UPDATE vod SET vod_hits = vod_hits + 1 WHERE vod_id = ?').bind(vodId).run().catch(() => {});

    const play_groups = MacPlayUrlParser.parse(
      row.vod_play_from,
      row.vod_play_url,
      row.vod_play_server,
      row.vod_play_note
    );

    return {
      ...row,
      play_groups,
    };
  }

  /**
   * 搜索联想提示 (Suggest API)
   */
  static async getSuggestions(db: D1Database, wd: string, limit = 10): Promise<string[]> {
    if (!wd || !wd.trim()) return [];
    const rows = await db
      .prepare('SELECT vod_name FROM vod WHERE vod_name LIKE ? ORDER BY vod_hits DESC LIMIT ?')
      .bind(`%${wd.trim()}%`, limit)
      .all<{ vod_name: string }>();

    return (rows.results || []).map(r => r.vod_name);
  }

  /**
   * 获取所有分类树
   */
  static async getTypes(db: D1Database): Promise<TypeItem[]> {
    const rows = await db
      .prepare('SELECT * FROM type WHERE type_status = 1 ORDER BY type_sort ASC, type_id ASC')
      .all<TypeItem>();
    const all = rows.results || [];

    // 组装父子树状结构
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
   * 录入或更新单个视频
   */
  static async saveVod(db: D1Database, data: Partial<VodItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const letter = data.vod_letter || MacPlayUrlParser.getFirstLetter(data.vod_name || '');

    if (data.vod_id && data.vod_id > 0) {
      // 更新已存在影片
      await db
        .prepare(`
          UPDATE vod SET
            type_id = ?, type_id_1 = ?, vod_name = ?, vod_sub = ?, vod_en = ?,
            vod_status = ?, vod_letter = ?, vod_tag = ?, vod_class = ?, vod_pic = ?,
            vod_actor = ?, vod_director = ?, vod_blurb = ?, vod_remarks = ?,
            vod_pubdate = ?, vod_area = ?, vod_lang = ?, vod_year = ?, vod_content = ?,
            vod_douban_score = ?, vod_score = ?, vod_isend = ?, vod_time = ?,
            vod_play_from = ?, vod_play_server = ?, vod_play_note = ?, vod_play_url = ?
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
          data.vod_tag || '',
          data.vod_class || '',
          data.vod_pic || '',
          data.vod_actor || '',
          data.vod_director || '',
          data.vod_blurb || '',
          data.vod_remarks || '',
          data.vod_pubdate || '',
          data.vod_area || '',
          data.vod_lang || '',
          data.vod_year || '',
          data.vod_content || '',
          data.vod_douban_score || 0.0,
          data.vod_score || 9.0,
          data.vod_isend || 0,
          now,
          data.vod_play_from || '',
          data.vod_play_server || '',
          data.vod_play_note || '',
          data.vod_play_url || '',
          data.vod_id
        )
        .run();
      return data.vod_id;
    } else {
      // 插入新记录
      const res = await db
        .prepare(`
          INSERT INTO vod (
            type_id, type_id_1, vod_name, vod_sub, vod_en, vod_status,
            vod_letter, vod_tag, vod_class, vod_pic, vod_actor, vod_director,
            vod_blurb, vod_remarks, vod_pubdate, vod_area, vod_lang, vod_year,
            vod_content, vod_douban_score, vod_score, vod_isend, vod_time, vod_time_add,
            vod_play_from, vod_play_server, vod_play_note, vod_play_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          data.type_id || 0,
          data.type_id_1 || 0,
          data.vod_name || '',
          data.vod_sub || '',
          data.vod_en || '',
          data.vod_status !== undefined ? data.vod_status : 1,
          letter,
          data.vod_tag || '',
          data.vod_class || '',
          data.vod_pic || '',
          data.vod_actor || '',
          data.vod_director || '',
          data.vod_blurb || '',
          data.vod_remarks || '',
          data.vod_pubdate || '',
          data.vod_area || '',
          data.vod_lang || '',
          data.vod_year || '',
          data.vod_content || '',
          data.vod_douban_score || 0.0,
          data.vod_score || 9.0,
          data.vod_isend || 0,
          now,
          now,
          data.vod_play_from || '',
          data.vod_play_server || '',
          data.vod_play_note || '',
          data.vod_play_url || ''
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

  /**
   * 获取所有系统全局配置
   */
  static async getConfigs(db: D1Database): Promise<Record<string, string>> {
    const rows = await db.prepare('SELECT key, value FROM config').all<{ key: string; value: string }>();
    const result: Record<string, string> = {};
    for (const r of rows.results || []) {
      result[r.key] = r.value;
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
  static async getBannerVods(db: D1Database, limit = 5): Promise<VodItem[]> {
    const rows = await db
      .prepare('SELECT v.*, t.type_name FROM vod v LEFT JOIN type t ON v.type_id = t.type_id WHERE v.vod_status = 1 ORDER BY v.vod_hits DESC, v.vod_time DESC LIMIT ?')
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
      db.prepare('SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_hits, vod_score, vod_douban_score FROM vod WHERE vod_status = 1 ORDER BY vod_hits DESC LIMIT ?').bind(limit).all<VodItem>(),
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
    opts: { page?: number; limit?: number; typeId?: number; wd?: string } = {}
  ): Promise<{ list: ArtItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 15));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['art_status = 1'];
    const params: any[] = [];

    if (opts.typeId && opts.typeId > 0) {
      conditions.push('a.type_id = ?');
      params.push(opts.typeId);
    }
    if (opts.wd && opts.wd.trim()) {
      conditions.push('(a.art_name LIKE ? OR a.art_blurb LIKE ?)');
      params.push(`%${opts.wd.trim()}%`, `%${opts.wd.trim()}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
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

  static async getArtDetail(db: D1Database, id: number): Promise<ArtItem | null> {
    const row = await db
      .prepare('SELECT a.*, t.type_name FROM art a LEFT JOIN type t ON a.type_id = t.type_id WHERE a.art_id = ? LIMIT 1')
      .bind(id)
      .first<ArtItem>();
    if (row) {
      db.prepare('UPDATE art SET art_hits = art_hits + 1 WHERE art_id = ?').bind(id).run().catch(() => {});
    }
    return row || null;
  }

  static async saveArt(db: D1Database, data: Partial<ArtItem>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    if (data.art_id && data.art_id > 0) {
      await db.prepare(`
        UPDATE art SET
          type_id = ?, art_name = ?, art_sub = ?, art_pic = ?, art_author = ?,
          art_from = ?, art_blurb = ?, art_content = ?, art_time = ?, art_rel_vod = ?
        WHERE art_id = ?
      `).bind(
        data.type_id || 0,
        data.art_name || '',
        data.art_sub || '',
        data.art_pic || '',
        data.art_author || '官方编辑',
        data.art_from || '本站原创',
        data.art_blurb || '',
        data.art_content || '',
        now,
        data.art_rel_vod || '',
        data.art_id
      ).run();
      return data.art_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO art (
          type_id, art_name, art_sub, art_en, art_pic, art_author, art_from,
          art_blurb, art_content, art_hits, art_time, art_time_add, art_rel_vod
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).bind(
        data.type_id || 0,
        data.art_name || '',
        data.art_sub || '',
        data.art_en || '',
        data.art_pic || '',
        data.art_author || '官方编辑',
        data.art_from || '本站原创',
        data.art_blurb || '',
        data.art_content || '',
        now,
        now,
        data.art_rel_vod || ''
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
  static async queryTopics(db: D1Database): Promise<TopicItem[]> {
    const rows = await db.prepare('SELECT * FROM topic WHERE topic_status = 1 ORDER BY topic_sort ASC, topic_id DESC').all<TopicItem>();
    return rows.results || [];
  }

  static async getTopicDetail(db: D1Database, id: number): Promise<(TopicItem & { vods: VodItem[] }) | null> {
    const row = await db.prepare('SELECT * FROM topic WHERE topic_id = ? LIMIT 1').bind(id).first<TopicItem>();
    if (!row) return null;

    db.prepare('UPDATE topic SET topic_hits = topic_hits + 1 WHERE topic_id = ?').bind(id).run().catch(() => {});

    let vods: VodItem[] = [];
    if (row.topic_rel_vod && row.topic_rel_vod.trim()) {
      const ids = row.topic_rel_vod.split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const vRows = await db.prepare(`SELECT vod_id, vod_name, vod_pic, vod_remarks, vod_score, vod_douban_score FROM vod WHERE vod_id IN (${placeholders})`).bind(...ids).all<VodItem>();
        vods = vRows.results || [];
      }
    }

    return {
      ...row,
      vods,
    };
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

  static async addComment(db: D1Database, data: { mid: number; rid: number; name?: string; content: string }): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const name = (data.name || '').trim() || '热心影迷';
    const content = (data.content || '').trim();
    if (!content) throw new Error('评论内容不能为空');

    const res = await db
      .prepare('INSERT INTO comment (comment_mid, comment_rid, comment_name, comment_content, comment_time, comment_status) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(data.mid, data.rid, name, content, now)
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

  static async getPlayers(db: D1Database): Promise<PlayerItem[]> {
    const rows = await db
      .prepare('SELECT * FROM player WHERE status = 1 ORDER BY sort ASC, id ASC')
      .all<PlayerItem>();
    return rows.results || [];
  }
}

