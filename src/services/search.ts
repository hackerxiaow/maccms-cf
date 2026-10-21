type SearchConfig = { meilisearch_url?: string; meilisearch_api_key?: string };
type SearchModel = 'vod' | 'art' | 'topic' | 'actor' | 'role' | 'website' | 'manga';
type SearchDocument = {
  id: string; model: SearchModel; rid: number; title: string; subtitle: string;
  keywords: string; body: string; pic: string; updated_at: number;
};

const MODELS: Array<{ model: SearchModel; table: string; id: string; select: string; visible: string }> = [
  { model: 'vod', table: 'vod', id: 'vod_id', select: "vod_id AS rid,vod_name AS title,vod_sub AS subtitle,vod_actor AS keywords,vod_blurb AS body,vod_pic AS pic,vod_time AS updated_at", visible: 'vod_status=1 AND COALESCE(vod_recycle_time,0)=0' },
  { model: 'art', table: 'art', id: 'art_id', select: "art_id AS rid,art_name AS title,art_sub AS subtitle,art_author AS keywords,art_blurb || ' ' || art_content AS body,art_pic AS pic,art_time AS updated_at", visible: 'art_status=1' },
  { model: 'topic', table: 'topic', id: 'topic_id', select: "topic_id AS rid,topic_name AS title,topic_sub AS subtitle,topic_extend || ' ' || topic_rel_vod AS keywords,topic_blurb || ' ' || topic_content AS body,topic_pic AS pic,topic_time AS updated_at", visible: 'topic_status=1' },
  { model: 'actor', table: 'actor', id: 'actor_id', select: "actor_id AS rid,actor_name AS title,actor_en AS subtitle,actor_area || ' ' || actor_works AS keywords,actor_blurb AS body,actor_pic AS pic,actor_time AS updated_at", visible: 'actor_status=1' },
  { model: 'role', table: 'role', id: 'role_id', select: "role_id AS rid,role_name AS title,role_actor_name || ' ' || role_vod_name AS subtitle,role_remarks AS keywords,role_content AS body,role_pic AS pic,role_time AS updated_at", visible: 'role_status=1' },
  { model: 'website', table: 'website', id: 'website_id', select: "website_id AS rid,website_name AS title,website_sub AS subtitle,website_url AS keywords,website_en AS body,website_logo AS pic,website_time AS updated_at", visible: 'website_status=1' },
  { model: 'manga', table: 'manga', id: 'manga_id', select: "manga_id AS rid,manga_name AS title,manga_sub AS subtitle,manga_author || ' ' || manga_tag AS keywords,manga_blurb AS body,manga_pic AS pic,manga_time AS updated_at", visible: 'manga_status=1 AND COALESCE(manga_recycle_time,0)=0' },
];

export class SearchService {
  private static endpoint(config: SearchConfig, path: string): URL {
    const base = String(config.meilisearch_url || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置 Meilisearch 地址');
    const url = new URL(`${base}${path}`);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('Meilisearch 必须使用 HTTPS');
    return url;
  }

  private static async request(config: SearchConfig, path: string, init: RequestInit = {}): Promise<Response> {
    if (!config.meilisearch_api_key) throw new Error('未配置 Meilisearch Search API Key');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${config.meilisearch_api_key}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(this.endpoint(config, path), { ...init, headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 400);
      throw new Error(`Meilisearch 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
    }
    return response;
  }

  static async isConfigured(db: D1Database): Promise<boolean> {
    const rows = await db.prepare("SELECT key,value FROM config WHERE key IN ('meilisearch_url','meilisearch_api_key')")
      .all<{ key: string; value: string }>();
    const values: Record<string, string> = {};
    for (const row of rows.results || []) values[row.key] = row.value;
    return Boolean(values.meilisearch_url && values.meilisearch_api_key);
  }

  private static async getConfig(db: D1Database): Promise<SearchConfig> {
    const rows = await db.prepare("SELECT key,value FROM config WHERE key IN ('meilisearch_url','meilisearch_api_key')")
      .all<{ key: string; value: string }>();
    const config: SearchConfig = {};
    for (const row of rows.results || []) (config as Record<string, string>)[row.key] = row.value;
    return config;
  }

  private static async waitTask(config: SearchConfig, taskUid: number): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await this.request(config, `/tasks/${taskUid}`);
      const task = await response.json() as { status?: string; error?: { message?: string } };
      if (task.status === 'succeeded') return;
      if (task.status === 'failed') throw new Error(task.error?.message || 'Meilisearch 索引任务失败');
      await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 250 + attempt * 100)));
    }
  }

  private static async enqueue(config: SearchConfig, response: Response): Promise<void> {
    const task = await response.json().catch(() => ({})) as { taskUid?: number; uid?: number };
    const uid = Number(task.taskUid || task.uid || 0);
    if (uid) await this.waitTask(config, uid);
  }

  static async rebuild(db: D1Database): Promise<{ indexed: number; models: number }> {
    const config = await this.getConfig(db);
    const indexPath = '/indexes/maccms_content';
    const create = await fetch(this.endpoint(config, '/indexes'), {
      method: 'POST', headers: { Authorization: `Bearer ${config.meilisearch_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'maccms_content', primaryKey: 'id' }), signal: AbortSignal.timeout(15000),
    });
    if (!create.ok && create.status !== 409) {
      const details = (await create.text().catch(() => '')).slice(0, 400);
      throw new Error(`创建搜索索引失败（HTTP ${create.status}）${details ? `：${details}` : ''}`);
    }
    if (create.ok) await this.enqueue(config, create);
    const clear = await this.request(config, `${indexPath}/documents`, { method: 'DELETE' });
    await this.enqueue(config, clear);
    const settings = await this.request(config, `${indexPath}/settings`, {
      method: 'PATCH', body: JSON.stringify({ searchableAttributes: ['title', 'subtitle', 'keywords', 'body'], filterableAttributes: ['model'] }),
    });
    await this.enqueue(config, settings);

    let indexed = 0;
    for (const spec of MODELS) {
      let offset = 0;
      while (true) {
        const page = await db.prepare(`SELECT ${spec.select} FROM ${spec.table} WHERE ${spec.visible} ORDER BY ${spec.id} LIMIT 500 OFFSET ?`)
          .bind(offset).all<Record<string, unknown>>();
        const rows = page.results || [];
        if (!rows.length) break;
        const docs: SearchDocument[] = rows.map((row) => {
          const rid = Number(row.rid || 0);
          return {
            id: `${spec.model}_${rid}`, model: spec.model, rid,
            title: String(row.title || ''), subtitle: String(row.subtitle || ''),
            keywords: String(row.keywords || ''), body: String(row.body || '').slice(0, 12000),
            pic: String(row.pic || ''), updated_at: Number(row.updated_at || 0),
          };
        });
        const response = await this.request(config, `${indexPath}/documents`, { method: 'POST', body: JSON.stringify(docs) });
        await this.enqueue(config, response);
        indexed += docs.length;
        offset += rows.length;
      }
    }
    await db.prepare("INSERT OR REPLACE INTO config(key,value) VALUES('meilisearch_last_sync',?)")
      .bind(String(Math.floor(Date.now() / 1000))).run();
    return { indexed, models: MODELS.length };
  }

  static async query(db: D1Database, model: SearchModel, query: string, page: number, limit: number): Promise<{ ids: number[]; total: number }> {
    const config = await this.getConfig(db);
    const offset = (Math.max(1, page) - 1) * limit;
    const response = await this.request(config, '/indexes/maccms_content/search', {
      method: 'POST', body: JSON.stringify({ q: query, filter: `model = "${model}"`, offset, limit }),
    });
    const result = await response.json() as { hits?: Array<{ rid?: number }>; estimatedTotalHits?: number; totalHits?: number };
    return {
      ids: (result.hits || []).map((hit) => Number(hit.rid || 0)).filter((id) => id > 0),
      total: Number(result.totalHits ?? result.estimatedTotalHits ?? 0),
    };
  }

  static async record(db: D1Database, query: string, count: number, mode: string): Promise<void> {
    const normalized = query.trim().toLocaleLowerCase().slice(0, 100);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const queryHash = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const logging = await db.prepare("SELECT value FROM config WHERE key='search_terms_logging'").first<{ value: string }>();
    await db.prepare('INSERT INTO search_query_log(query_hash,query_length,result_count,search_mode,created_at,query_text) VALUES(?,?,?,?,?,?)')
      .bind(queryHash, normalized.length, Math.max(0, count), mode, Math.floor(Date.now() / 1000), logging?.value === '1' ? normalized : '').run();
  }

  static async stats(db: D1Database, daysInput = 30): Promise<{ totals: { searches: number; empty: number; meilisearch: number }; days: any[]; hotwords: any[]; hotwords_enabled: boolean }> {
    const days = Math.max(1, Math.min(90, Math.trunc(daysInput) || 30));
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const [totals, rows, logging, hotwords] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS searches,SUM(CASE WHEN result_count=0 THEN 1 ELSE 0 END) AS empty,
        SUM(CASE WHEN search_mode='meilisearch' THEN 1 ELSE 0 END) AS meilisearch
        FROM search_query_log WHERE created_at>=?`).bind(since).first<{ searches: number; empty: number; meilisearch: number }>(),
      db.prepare(`SELECT date(created_at,'unixepoch') AS day,COUNT(*) AS searches,
        SUM(CASE WHEN result_count=0 THEN 1 ELSE 0 END) AS empty,AVG(result_count) AS average_results
        FROM search_query_log WHERE created_at>=? GROUP BY date(created_at,'unixepoch') ORDER BY day DESC LIMIT ?`)
        .bind(since, days).all(),
      db.prepare("SELECT value FROM config WHERE key='search_terms_logging'").first<{ value: string }>(),
      db.prepare(`SELECT query_text,COUNT(*) AS searches,SUM(CASE WHEN result_count=0 THEN 1 ELSE 0 END) AS empty
        FROM search_query_log WHERE created_at>=? AND query_text<>'' GROUP BY query_text ORDER BY searches DESC LIMIT 30`).bind(since).all(),
    ]);
    return { totals: { searches: Number(totals?.searches || 0), empty: Number(totals?.empty || 0), meilisearch: Number(totals?.meilisearch || 0) }, days: rows.results || [], hotwords: logging?.value === '1' ? (hotwords.results || []) : [], hotwords_enabled: logging?.value === '1' };
  }
}
