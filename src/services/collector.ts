// ========================================================
// 资源站采集引擎服务 (支持 MacCMS XML / JSON 接口与智能合并入库)
// 支持 urlrole=0/1、vod_lock保护、广告词过滤、多页断点记录
// ========================================================

import type { CollectNodeItem, TypeBindItem, VodItem, CjHistoryItem } from '../types/index.ts';
import { MacPlayUrlParser } from '../utils/parser.ts';
import { MacXmlUtils } from '../utils/xml.ts';

export interface IngestResult {
  nodeName: string;
  totalFetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  page: number;
  pagecount: number;
  total: number;
  messages: string[];
}

export class CollectorService {
  /**
   * 拉取远程资源站的分类字典列表 (用于后台分类绑定页面)
   */
  static async fetchRemoteClasses(
    node: CollectNodeItem
  ): Promise<{ type_id: number; type_name: string }[]> {
    const targetUrl = new URL(node.api_url);
    targetUrl.searchParams.set('ac', 'list');

    if (node.api_type === 'xml') {
      targetUrl.searchParams.set('at', 'xml');
    }

    const res = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (MacCMS-Worker-Edge/1.0)',
      },
    });

    if (!res.ok) {
      throw new Error(`远程接口返回 HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();

    if (node.api_type === 'xml' || text.trim().startsWith('<?xml') || text.includes('<rss')) {
      const parsed = MacXmlUtils.parseRssXml(text);
      return parsed.class;
    } else {
      try {
        const json: any = JSON.parse(text);
        if (json.class && Array.isArray(json.class)) {
          return json.class.map((c: any) => ({
            type_id: Number(c.type_id),
            type_name: String(c.type_name),
          }));
        }
      } catch (err) {
        throw new Error(`解析远程 JSON 失败: ${(err as Error).message}`);
      }
    }

    return [];
  }

  /**
   * 执行单个采集节点的同步任务
   * @param hours 增量采集跨度，如 24 (今日采集) 或 0 (全量采集)
   * @param page 页码，默认第 1 页
   */
  static async runCollectTask(
    db: D1Database,
    node: CollectNodeItem,
    hours = 24,
    page = 1
  ): Promise<IngestResult> {
    const started = Date.now();
    try {
      const result = await this.runCollectTaskInternal(db, node, hours, page);
      const failed = result.messages.some((message) => /HTTP 错误|格式解析异常/.test(message));
      await db.prepare(`INSERT INTO collect_run_log
        (node_id, node_name, hours, page, fetched, inserted, updated, skipped, success, message, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(node.id, node.name, hours, page, result.totalFetched, result.inserted, result.updated,
          result.skipped, failed ? 0 : 1, result.messages.join('；').slice(0, 1000), Date.now() - started,
          Math.floor(Date.now() / 1000)).run();
      return result;
    } catch (error) {
      try {
        await db.prepare(`INSERT INTO collect_run_log
          (node_id, node_name, hours, page, success, message, duration_ms, created_at)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
          .bind(node.id, node.name, hours, page, (error as Error).message.slice(0, 1000), Date.now() - started,
            Math.floor(Date.now() / 1000)).run();
      } catch (logError) {
        console.error('Failed to write collector run log:', logError);
      }
      throw error;
    }
  }

  private static async runCollectTaskInternal(
    db: D1Database,
    node: CollectNodeItem,
    hours = 24,
    page = 1
  ): Promise<IngestResult> {
    const result: IngestResult = {
      nodeName: node.name,
      totalFetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      page,
      pagecount: 1,
      total: 0,
      messages: [],
    };

    // 1. 读取系统配置 (urlrole: 1=智能合并, 0=完全覆盖)
    const configRow = await db.prepare("SELECT value FROM config WHERE key = 'urlrole'").first<{ value: string }>();
    const urlrole = configRow?.value !== undefined ? configRow.value : '1';

    // 2. 构建请求 URL
    const targetUrl = new URL(node.api_url);
    targetUrl.searchParams.set('ac', 'videolist');
    targetUrl.searchParams.set('pg', String(page));
    if (hours > 0) {
      targetUrl.searchParams.set('h', String(hours));
    }
    if (node.api_type === 'xml') {
      targetUrl.searchParams.set('at', 'xml');
    }

    const resp = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (MacCMS-Serverless/1.0)',
      },
    });

    if (!resp.ok) {
      result.messages.push(`HTTP 错误: ${resp.status}`);
      return result;
    }

    const bodyText = await resp.text();
    let videoList: any[] = [];

    // 3. 识别并解析 XML 或 JSON 响应，获取分页元数据
    if (node.api_type === 'xml' || bodyText.trim().startsWith('<?xml') || bodyText.includes('<rss')) {
      const parsed = MacXmlUtils.parseRssXml(bodyText);
      videoList = parsed.list;
      result.page = parsed.page || page;
      result.pagecount = parsed.pagecount || 1;
      result.total = parsed.total || videoList.length;
    } else {
      try {
        const json: any = JSON.parse(bodyText);
        videoList = json.list || [];
        result.page = Number(json.page || page);
        result.pagecount = Number(json.pagecount || 1);
        result.total = Number(json.total || videoList.length);
      } catch (e) {
        result.messages.push(`JSON 数据格式解析异常: ${(e as Error).message}`);
        return result;
      }
    }

    result.totalFetched = videoList.length;
    if (videoList.length === 0) {
      result.messages.push('未获取到更新数据');
      return result;
    }

    // 4. 读取该节点的分类映射配置
    const bindRows = await db
      .prepare('SELECT source_type_id, local_type_id FROM type_bind WHERE source_id = ?')
      .bind(node.id)
      .all<TypeBindItem>();
    const bindMap = new Map<number, number>(
      (bindRows.results || []).map(b => [b.source_type_id, b.local_type_id])
    );

    // 预热分类表以推导顶级分类 type_id_1
    const typeRows = await db.prepare('SELECT type_id, type_pid FROM type').all<{ type_id: number; type_pid: number }>();
    const typePidMap = new Map<number, number>((typeRows.results || []).map(t => [t.type_id, t.type_pid]));

    // 广告词过滤字典
    const filterWords = (node.filter_word || '')
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);

    const cleanText = (str: string): string => {
      let s = str || '';
      for (const w of filterWords) {
        s = s.replaceAll(w, '');
      }
      return s.trim();
    };

    const now = Math.floor(Date.now() / 1000);

    // 5. 逐条处理入库
    for (const item of videoList) {
      const sourceTypeId = Number(item.type_id || item.tid || 0);
      let localTypeId = bindMap.get(sourceTypeId);

      if (!localTypeId) {
        result.skipped++;
        continue;
      }

      let typeId1 = typePidMap.get(localTypeId) || 0;
      if (typeId1 === 0) {
        typeId1 = localTypeId;
      }

      const rawVodName = (item.vod_name || item.name || '').trim();
      const vodName = cleanText(rawVodName);
      if (!vodName) {
        result.skipped++;
        continue;
      }

      // 解析远程携带的播放地址
      let incomingGroups = MacPlayUrlParser.parse(
        item.vod_play_from || item.dl?.dd?.[0]?.['@flag'] || '',
        item.vod_play_url || '',
        item.vod_play_server || '',
        item.vod_play_note || ''
      );

      // 如果指定了播放器过滤，优先保留匹配的播放器，或重命名首选播放组
      if (node.filter_from && node.filter_from.trim()) {
        const filterKey = node.filter_from.trim().toLowerCase();
        const matchedGroup = incomingGroups.find(g => g.from.toLowerCase() === filterKey);
        if (matchedGroup) {
          incomingGroups = [matchedGroup];
        } else if (incomingGroups.length > 0) {
          incomingGroups[0].from = filterKey;
        }
      }

      // 查询本地是否已存在同名影片
      const existing = await db
        .prepare('SELECT * FROM vod WHERE vod_name = ? LIMIT 1')
        .bind(vodName)
        .first<VodItem>();

      if (!existing) {
        // 新增影片入库
        const serialized = MacPlayUrlParser.serialize(incomingGroups);
        const letter = MacPlayUrlParser.getFirstLetter(vodName);

        await db
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
            localTypeId,
            typeId1,
            vodName,
            cleanText(item.vod_sub || ''),
            item.vod_en || '',
            1,
            letter,
            cleanText(item.vod_tag || ''),
            cleanText(item.vod_class || item.type_name || ''),
            item.vod_pic || item.pic || '',
            cleanText(item.vod_actor || item.actor || ''),
            cleanText(item.vod_director || item.director || ''),
            cleanText(item.vod_blurb || ''),
            cleanText(item.vod_remarks || item.note || ''),
            item.vod_pubdate || '',
            item.vod_area || item.area || '',
            item.vod_lang || item.lang || '',
            item.vod_year || item.year || '',
            cleanText(item.vod_content || item.des || ''),
            parseFloat(item.vod_douban_score || 0),
            parseFloat(item.vod_score || 9.0),
            parseInt(item.vod_isend || item.state || 0, 10),
            now,
            now,
            serialized.vod_play_from,
            serialized.vod_play_server,
            serialized.vod_play_note,
            serialized.vod_play_url
          )
          .run();

        result.inserted++;
      } else {
        // 锁定检查：如果影片已锁定 (vod_lock=1)，不覆盖
        if (existing.vod_lock === 1) {
          result.skipped++;
          continue;
        }

        // urlrole 处理：1=智能合并去重, 0=覆盖播放列表
        let finalGroups = incomingGroups;
        if (urlrole === '1') {
          const existingGroups = MacPlayUrlParser.parse(
            existing.vod_play_from,
            existing.vod_play_url,
            existing.vod_play_server,
            existing.vod_play_note
          );
          finalGroups = MacPlayUrlParser.mergeGroups(existingGroups, incomingGroups);
        }

        const serialized = MacPlayUrlParser.serialize(finalGroups);

        await db
          .prepare(`
            UPDATE vod SET
              vod_remarks = ?,
              vod_play_from = ?,
              vod_play_server = ?,
              vod_play_note = ?,
              vod_play_url = ?,
              vod_time = ?
            WHERE vod_id = ?
          `)
          .bind(
            cleanText(item.vod_remarks || item.note || existing.vod_remarks),
            serialized.vod_play_from,
            serialized.vod_play_server,
            serialized.vod_play_note,
            serialized.vod_play_url,
            now,
            existing.vod_id
          )
          .run();

        result.updated++;
      }
    }

    // 更新最后采集运行时间戳
    await db.prepare('UPDATE collect_node SET last_run_time = ? WHERE id = ?').bind(now, node.id).run();

    // 更新断点续采记录表 cj_history
    await db.prepare(`
      INSERT INTO cj_history (node_id, page, total_page, total_records, last_time, status)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(node.id, result.page, result.pagecount, result.total, now).run().catch(() => {});

    result.messages.push(
      `成功处理第 ${result.page}/${result.pagecount} 页数据 (${result.inserted} 新增, ${result.updated} 更新, ${result.skipped} 跳过, 共 ${result.total} 条)`
    );
    return result;
  }
}
