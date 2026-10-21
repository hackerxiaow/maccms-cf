export const TRANSLATION_FIELDS: Record<string, string[]> = {
  vod: ['vod_name', 'vod_sub', 'vod_blurb', 'vod_content', 'vod_remarks', 'vod_plot_name', 'vod_plot_detail'],
  art: ['art_name', 'art_sub', 'art_blurb', 'art_content'],
  topic: ['topic_name', 'topic_sub', 'topic_blurb', 'topic_content'],
  actor: ['actor_name', 'actor_blurb', 'actor_remarks', 'actor_works', 'actor_content'],
  role: ['role_name', 'role_remarks', 'role_content', 'role_actor_name', 'role_vod_name'],
  manga: ['manga_name', 'manga_sub', 'manga_blurb', 'manga_remarks', 'manga_content'],
  website: ['website_name', 'website_sub'],
};

const ID_COLUMNS: Record<string, string> = {
  vod: 'vod_id', art: 'art_id', topic: 'topic_id', actor: 'actor_id', role: 'role_id', manga: 'manga_id', website: 'website_id',
};

export class ContentTranslationService {
  static validLanguage(value: string): boolean {
    return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value);
  }

  static async apply<T extends object>(db: D1Database, model: string, records: T[], languageInput: string | undefined): Promise<T[]> {
    const language = String(languageInput || '').trim();
    const idColumn = ID_COLUMNS[model];
    if (!language || !idColumn || !this.validLanguage(language) || !records.length) return records;
    const ids = records.map((item) => Number((item as Record<string, unknown>)[idColumn] || 0)).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return records;
    const translations = new Map<number, Map<string, string>>();
    for (let offset = 0; offset < ids.length; offset += 80) {
      const batch = ids.slice(offset, offset + 80);
      const rows = await db.prepare(`SELECT record_id,field_name,translated_value FROM content_translation
        WHERE model=? AND language=? AND record_id IN (${batch.map(() => '?').join(',')})`)
        .bind(model, language, ...batch).all<{ record_id: number; field_name: string; translated_value: string }>();
      for (const row of rows.results || []) {
        if (!TRANSLATION_FIELDS[model]?.includes(row.field_name)) continue;
        if (!translations.has(row.record_id)) translations.set(row.record_id, new Map());
        translations.get(row.record_id)!.set(row.field_name, row.translated_value);
      }
    }
    return records.map((record) => {
      const fields = translations.get(Number((record as Record<string, unknown>)[idColumn] || 0));
      if (!fields) return record;
      const localized = { ...record } as Record<string, unknown>;
      for (const [field, value] of fields) localized[field] = value;
      return localized as T;
    });
  }
}
