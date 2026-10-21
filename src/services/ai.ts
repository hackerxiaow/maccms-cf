import type { Bindings } from '../types/index.ts';

const CONTENT_MODELS: Record<string, { table: string; id: string; fields: string[] }> = {
  vod: { table: 'vod', id: 'vod_id', fields: ['vod_name','vod_sub','vod_actor','vod_director','vod_blurb','vod_content','vod_year','vod_area','vod_class','vod_remarks'] },
  art: { table: 'art', id: 'art_id', fields: ['art_name','art_sub','art_author','art_blurb','art_content'] },
  topic: { table: 'topic', id: 'topic_id', fields: ['topic_name','topic_sub','topic_blurb','topic_content'] },
  actor: { table: 'actor', id: 'actor_id', fields: ['actor_name','actor_area','actor_works','actor_blurb','actor_content'] },
  role: { table: 'role', id: 'role_id', fields: ['role_name','role_actor_name','role_vod_name','role_remarks','role_content'] },
  manga: { table: 'manga', id: 'manga_id', fields: ['manga_name','manga_sub','manga_author','manga_tag','manga_blurb','manga_content'] },
  website: { table: 'website', id: 'website_id', fields: ['website_name','website_sub','website_url'] },
};

type AiTask = 'summary' | 'metadata' | 'seo';

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
    if (!['summary', 'metadata', 'seo'].includes(input.task)) throw new Error('AI 任务类型无效');
    const config = await this.status(env.DB);
    if (!config.configured) throw new Error('请先配置 AI 兼容接口地址、模型和 API Key');
    const secretRow = await env.DB.prepare("SELECT value FROM config WHERE key='ai_api_key'").first<{ value: string }>();
    const record = await env.DB.prepare(`SELECT ${[spec.id, ...spec.fields].join(',')} FROM ${spec.table} WHERE ${spec.id}=?`)
      .bind(input.recordId).first<Record<string, unknown>>();
    if (!record) throw new Error('指定内容不存在');
    const content: Record<string, string> = {};
    for (const field of spec.fields) {
      const raw = String(record[field] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw) content[field] = raw.slice(0, field.endsWith('_content') || field.endsWith('_blurb') ? 4000 : 500);
    }
    const tasks: Record<AiTask, string> = {
      summary: '请为这条内容生成一段准确、克制的中文简介，控制在 120 个汉字内。不要编造素材中没有的事实。只返回简介正文。',
      metadata: '请根据素材生成内容标签、分类建议、关键词和适合的简短副标题。只返回 JSON 对象，字段为 tags、category_suggestions、keywords、subtitle；不要编造素材中没有的事实。',
      seo: '请为这条内容生成 SEO 标题、关键词和描述。只返回 JSON 对象，字段为 title、keywords、description；标题不超过 60 字，描述不超过 160 字，不要编造事实。',
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
}
