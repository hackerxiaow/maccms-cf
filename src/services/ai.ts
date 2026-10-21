import type { Bindings } from '../types/index.ts';

const CONTENT_MODELS: Record<string, { table: string; id: string; fields: string[] }> = {
  vod: { table: 'vod', id: 'vod_id', fields: ['vod_name','vod_sub','vod_actor','vod_director','vod_blurb','vod_content','vod_year','vod_area','vod_class','vod_remarks'] },
  art: { table: 'art', id: 'art_id', fields: ['art_name','art_sub','art_author','art_blurb','art_content'] },
  topic: { table: 'topic', id: 'topic_id', fields: ['topic_name','topic_sub','topic_blurb','topic_content'] },
  actor: { table: 'actor', id: 'actor_id', fields: ['actor_name','actor_area','actor_works','actor_blurb','actor_content'] },
  role: { table: 'role', id: 'role_id', fields: ['role_name','role_actor_name','role_vod_name','role_remarks','role_content'] },
  manga: { table: 'manga', id: 'manga_id', fields: ['manga_name','manga_sub','manga_author','manga_tag','manga_blurb','manga_content'] },
  website: { table: 'website', id: 'website_id', fields: ['website_name','website_sub','website_url'] },
  user: { table: 'user', id: 'user_id', fields: ['group_id','user_points','user_reg_time'] },
};

type AiTask = 'summary' | 'metadata' | 'seo' | 'recommendations' | 'quality' | 'profile';

export class AiService {
  static async status(db: D1Database) {
    const rows = await db.prepare("SELECT key,value FROM config WHERE key IN ('ai_base_url','ai_model','ai_api_key')")
      .all<{ key: string; value: string }>();
    const settings: Record<string, string> = {};
    for (const row of rows.results || []) settings[row.key] = row.value;
    return { configured: Boolean(settings.ai_base_url && settings.ai_model && settings.ai_api_key), base_url: settings.ai_base_url || '', model: settings.ai_model || '', key_set: Boolean(settings.ai_api_key) };
  }

  static async generate(env: Bindings, input: { model: string; recordId: number; task: AiTask }): Promise<string> {
    const spec = CONTENT_MODELS[input.model];
    if (!spec || !Number.isInteger(input.recordId) || input.recordId <= 0) throw new Error('内容模型或 ID 无效');
    if (!['summary', 'metadata', 'seo', 'recommendations', 'quality', 'profile'].includes(input.task)) throw new Error('AI 任务类型无效');
    if (input.task === 'profile' && input.model !== 'user') throw new Error('会员画像任务只能选择会员模型');
    if (input.model === 'user' && input.task !== 'profile') throw new Error('会员模型仅支持会员画像任务');
    const config = await this.status(env.DB);
    if (!config.configured) throw new Error('请先配置 AI 兼容接口地址、模型和 API Key');
    const secretRow = await env.DB.prepare("SELECT value FROM config WHERE key='ai_api_key'").first<{ value: string }>();
    const record = await env.DB.prepare(`SELECT ${[spec.id, ...spec.fields].join(',')} FROM ${spec.table} WHERE ${spec.id}=?`)
      .bind(input.recordId).first<Record<string, unknown>>();
    if (!record) throw new Error('指定内容不存在');
    const content: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const raw = String(record[field] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw) content[field] = raw.slice(0, field.endsWith('_content') || field.endsWith('_blurb') ? 4000 : 500);
    }
    if (input.model === 'user') {
      const [activity, follows] = await Promise.all([
        env.DB.prepare('SELECT ulog_mid AS model,ulog_type AS action,COUNT(*) AS total FROM ulog WHERE user_id=? GROUP BY ulog_mid,ulog_type ORDER BY total DESC LIMIT 20').bind(input.recordId).all(),
        env.DB.prepare('SELECT COUNT(*) AS total FROM user_follow WHERE user_id=?').bind(input.recordId).first<{ total: number }>(),
      ]);
      content.behavior_summary = JSON.stringify({ activity: activity.results || [], follow_count: Number(follows?.total || 0) });
    }
    if (input.model === 'vod' && input.task === 'recommendations') {
      const candidates = await env.DB.prepare(`SELECT vod_id,vod_name,vod_year,vod_area,vod_actor,vod_score,vod_hits FROM vod
        WHERE vod_status=1 AND vod_id<>? AND (type_id=(SELECT type_id FROM vod WHERE vod_id=?) OR vod_year=(SELECT vod_year FROM vod WHERE vod_id=?))
        ORDER BY vod_hits DESC,vod_score DESC LIMIT 40`).bind(input.recordId, input.recordId, input.recordId).all();
      content.available_candidates = candidates.results || [];
    }
    const tasks: Record<AiTask, string> = {
      summary: '请为这条内容生成一段准确、克制的中文简介，控制在 120 个汉字内。不要编造素材中没有的事实。只返回简介正文。',
      metadata: '请根据素材生成内容标签、分类建议、关键词和适合的简短副标题。只返回 JSON 对象，字段为 tags、category_suggestions、keywords、subtitle；不要编造素材中没有的事实。',
      seo: '请为这条内容生成 SEO 标题、关键词和描述。只返回 JSON 对象，字段为 title、keywords、description；标题不超过 60 字，描述不超过 160 字，不要编造事实。',
      recommendations: '从 available_candidates 中推荐最多 8 个与当前影片相关的条目，只能使用候选项中真实存在的 vod_id 和名称。只返回 JSON：{"items":[{"vod_id":1,"name":"候选名称","reason":"简短推荐理由"}]}。理由只能依据素材相似度，不要编造剧情。',
      quality: '请给这条内容做编辑质量检查，重点看字段完整度、内部矛盾、疑似无效或重复描述。不要判断或补充素材之外的事实。只返回 JSON：{"score":0,"issues":[{"field":"字段名","severity":"warning|block","reason":"问题说明"}],"suggestions":["修改建议"]}。',
      profile: '请根据 behavior_summary 生成简短的站内会员兴趣画像和内容运营建议。这里不包含身份、邮箱、IP 等直接识别信息；不得尝试识别会员本人。只返回 JSON：{"interests":["兴趣方向"],"engagement":"活跃度说明","recommendation_strategy":["推荐策略"]}。不要推断敏感属性。',
    };
    let endpoint: URL;
    try { endpoint = new URL(`${config.base_url.replace(/\/+$/, '')}/chat/completions`); }
    catch { throw new Error('AI 兼容接口地址格式无效'); }
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') throw new Error('AI 接口必须使用 HTTPS');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretRow?.value || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, temperature: 0.3, max_tokens: 1200,
        messages: [
          { role: 'system', content: '你是影视与内容站点的编辑助手。只处理管理员明确提交的内容，避免过度推断。' },
          { role: 'user', content: `${tasks[input.task]}\n内容模型：${input.model}\n素材：${JSON.stringify(content)}` },
        ] }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`AI 服务返回 HTTP ${response.status}：${(await response.text().catch(() => '')).slice(0, 300)}`);
    const result = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const message = result.choices?.[0]?.message?.content;
    const output = Array.isArray(message) ? message.map((part) => part.text || '').join('') : String(message || '');
    if (!output.trim()) throw new Error('AI 服务没有返回可用内容');
    return output.trim().slice(0, 12000);
  }

  static async semanticSearch(env: Bindings, query: string): Promise<Array<{ model: 'vod' | 'art'; id: number; title: string; pic: string; summary: string; reason: string }>> {
    const config = await this.status(env.DB);
    if (!config.configured) throw new Error('请先在系统设置配置 AI 兼容接口、模型和 Key');
    const secretRow = await env.DB.prepare("SELECT value FROM config WHERE key='ai_api_key'").first<{ value: string }>();
    const term = `%${query.replace(/[\\%_]/g, '')}%`;
    const [matchingVod, popularVod, matchingArt, popularArt] = await Promise.all([
      env.DB.prepare(`SELECT vod_id AS id,'vod' AS model,vod_name AS title,vod_pic AS pic,vod_blurb AS summary,vod_actor AS keywords,vod_area,vod_year,vod_class
        FROM vod WHERE vod_status=1 AND COALESCE(vod_recycle_time,0)=0 AND (vod_name LIKE ? OR vod_actor LIKE ? OR vod_director LIKE ? OR vod_blurb LIKE ? OR vod_content LIKE ? OR vod_class LIKE ?)
        ORDER BY CASE WHEN vod_name LIKE ? THEN 0 ELSE 1 END,vod_hits DESC,vod_score DESC LIMIT 35`)
        .bind(term, term, term, term, term, term, term).all<any>(),
      env.DB.prepare(`SELECT vod_id AS id,'vod' AS model,vod_name AS title,vod_pic AS pic,vod_blurb AS summary,vod_actor AS keywords,vod_area,vod_year,vod_class
        FROM vod WHERE vod_status=1 AND COALESCE(vod_recycle_time,0)=0 ORDER BY vod_hits DESC,vod_score DESC LIMIT 35`).all<any>(),
      env.DB.prepare(`SELECT art_id AS id,'art' AS model,art_name AS title,art_pic AS pic,art_blurb AS summary,art_author AS keywords,'' AS vod_area,'' AS vod_year,'' AS vod_class
        FROM art WHERE art_status=1 AND (art_name LIKE ? OR art_author LIKE ? OR art_blurb LIKE ? OR art_content LIKE ?)
        ORDER BY CASE WHEN art_name LIKE ? THEN 0 ELSE 1 END,art_time DESC LIMIT 20`)
        .bind(term, term, term, term, term).all<any>(),
      env.DB.prepare(`SELECT art_id AS id,'art' AS model,art_name AS title,art_pic AS pic,art_blurb AS summary,art_author AS keywords,'' AS vod_area,'' AS vod_year,'' AS vod_class
        FROM art WHERE art_status=1 ORDER BY art_time DESC LIMIT 20`).all<any>(),
    ]);
    const byKey = new Map<string, any>();
    for (const row of [...(matchingVod.results || []), ...(popularVod.results || []), ...(matchingArt.results || []), ...(popularArt.results || [])]) {
      const key = `${row.model}:${Number(row.id)}`;
      if (!byKey.has(key)) byKey.set(key, { ...row, summary: String(row.summary || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 260), keywords: String(row.keywords || '').slice(0, 160) });
    }
    const candidates = [...byKey.values()].slice(0, 100);
    if (!candidates.length) return [];
    let endpoint: URL;
    try { endpoint = new URL(`${config.base_url.replace(/\/+$/, '')}/chat/completions`); } catch { throw new Error('AI 兼容接口地址格式无效'); }
    const response = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${secretRow?.value || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, temperature: 0.1, max_tokens: 900,
        messages: [
          { role: 'system', content: '你是影视内容检索排序器。根据用户自然语言，从给出的候选数据中挑选最相关的条目。只能返回候选中真实存在的 key，不能编造作品、分类或剧情。输出严格 JSON：{"items":[{"key":"vod:1","reason":"简短相关原因"}]}，最多 12 项。' },
          { role: 'user', content: `搜索意图：${query.slice(0, 200)}\n候选：${JSON.stringify(candidates.map(({ id, model, title, summary, keywords, vod_area, vod_year, vod_class }) => ({ key: `${model}:${id}`, title, summary, keywords, area: vod_area, year: vod_year, category: vod_class })))}` },
        ] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`AI 搜索服务返回 HTTP ${response.status}`);
    const result = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const raw = result.choices?.[0]?.message?.content;
    const output = (Array.isArray(raw) ? raw.map((part) => part.text || '').join('') : String(raw || '')).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed: { items?: Array<{ key?: string; reason?: string }> };
    try { parsed = JSON.parse(output); } catch { throw new Error('AI 搜索返回格式无效，请重试'); }
    const candidatesByKey = new Map(candidates.map((row) => [`${row.model}:${Number(row.id)}`, row]));
    const selected = Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [];
    const used = new Set<string>();
    return selected.flatMap((entry) => {
      const key = String(entry.key || ''), row = candidatesByKey.get(key);
      if (!row || used.has(key)) return [];
      used.add(key);
      return [{ model: row.model, id: Number(row.id), title: String(row.title || ''), pic: String(row.pic || ''), summary: String(row.summary || ''), reason: String(entry.reason || '').slice(0, 120) }];
    });
  }
}
