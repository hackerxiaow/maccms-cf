// ========================================================
// MacCMS RSS 5.1 / 2.0 标准 XML 构建器与解析器
// 用于对下游输出 at=xml 和向下游采集 XML 资源源
// ========================================================

import type { VodItem, TypeItem } from '../types/index.ts';

export class MacXmlUtils {
  /**
   * 将视频列表和分类字典构建为 MacCMS 官方标准的 RSS 5.1 XML 报文
   */
  static buildRssXml(
    videos: VodItem[],
    types: TypeItem[],
    page: number,
    pagecount: number,
    limit: number,
    total: number,
    isDetail: boolean
  ): string {
    const typeMap = new Map<number, string>(types.map(t => [t.type_id, t.type_name]));

    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<rss version="5.1">\n`;
    xml += `  <list page="${page}" pagecount="${pagecount}" pagesize="${limit}" recordcount="${total}">\n`;

    for (const v of videos) {
      const typeName = typeMap.get(v.type_id) || '';
      const dateStr = v.vod_time > 0
        ? new Date(v.vod_time * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '';

      xml += `    <video>\n`;
      xml += `      <last>${dateStr}</last>\n`;
      xml += `      <id>${v.vod_id}</id>\n`;
      xml += `      <tid>${v.type_id}</tid>\n`;
      xml += `      <name><![CDATA[${v.vod_name}]]></name>\n`;
      xml += `      <type>${typeName}</type>\n`;

      if (isDetail) {
        xml += `      <pic>${v.vod_pic || ''}</pic>\n`;
        xml += `      <lang>${v.vod_lang || ''}</lang>\n`;
        xml += `      <area>${v.vod_area || ''}</area>\n`;
        xml += `      <year>${v.vod_year || ''}</year>\n`;
        xml += `      <state>${v.vod_isend || 0}</state>\n`;
        xml += `      <note><![CDATA[${v.vod_remarks || ''}]]></note>\n`;
        xml += `      <actor><![CDATA[${v.vod_actor || ''}]]></actor>\n`;
        xml += `      <director><![CDATA[${v.vod_director || ''}]]></director>\n`;
        xml += `      <des><![CDATA[${v.vod_content || ''}]]></des>\n`;

        // 组装 <dl><dd flag="...">...</dd></dl>
        const froms = (v.vod_play_from || '').split('$$$');
        const urls = (v.vod_play_url || '').split('$$$');
        xml += `      <dl>\n`;
        froms.forEach((f, idx) => {
          if (f.trim()) {
            xml += `        <dd flag="${f.trim()}"><![CDATA[${urls[idx] || ''}]]></dd>\n`;
          }
        });
        xml += `      </dl>\n`;
      } else {
        xml += `      <dt>${(v.vod_play_from || '').replace(/\$\$\$/g, ',')}</dt>\n`;
        xml += `      <note><![CDATA[${v.vod_remarks || ''}]]></note>\n`;
      }

      xml += `    </video>\n`;
    }

    xml += `  </list>\n`;

    // 输出全站分类字典供采集方做分类映射绑定
    if (!isDetail || types.length > 0) {
      xml += `  <class>\n`;
      for (const t of types) {
        xml += `    <ty id="${t.type_id}">${t.type_name}</ty>\n`;
      }
      xml += `  </class>\n`;
    }

    xml += `</rss>`;
    return xml;
  }

  /**
   * 解析外部资源站返回的标准 MacCMS RSS XML 报文
   */
  static parseRssXml(xmlStr: string): {
    page: number;
    pagecount: number;
    limit: number;
    total: number;
    class: { type_id: number; type_name: string }[];
    list: any[];
  } {
    const result = {
      page: 1,
      pagecount: 1,
      limit: 20,
      total: 0,
      class: [] as { type_id: number; type_name: string }[],
      list: [] as any[],
    };

    if (!xmlStr) return result;

    // 1. 提取 <list> 属性
    const listMatch = xmlStr.match(/<list[^>]*page="(\d+)"[^>]*pagecount="(\d+)"[^>]*pagesize="(\d+)"[^>]*recordcount="(\d+)"/i) ||
                      xmlStr.match(/<list[^>]*recordcount="(\d+)"[^>]*pagecount="(\d+)"[^>]*pagesize="(\d+)"[^>]*page="(\d+)"/i);
    if (listMatch) {
      result.page = parseInt(listMatch[1], 10) || 1;
      result.pagecount = parseInt(listMatch[2], 10) || 1;
      result.limit = parseInt(listMatch[3], 10) || 20;
      result.total = parseInt(listMatch[4], 10) || 0;
    }

    // 2. 提取 <class> 分类列表
    const classBlock = xmlStr.match(/<class>([\s\S]*?)<\/class>/i);
    if (classBlock) {
      const tyRegex = /<ty\s+id="(\d+)">([^<]+)<\/ty>/gi;
      let tyMatch;
      while ((tyMatch = tyRegex.exec(classBlock[1])) !== null) {
        result.class.push({
          type_id: parseInt(tyMatch[1], 10),
          type_name: tyMatch[2].trim(),
        });
      }
    }

    // 3. 提取各个 <video> 节点
    const videoRegex = /<video>([\s\S]*?)<\/video>/gi;
    let videoMatch;

    while ((videoMatch = videoRegex.exec(xmlStr)) !== null) {
      const vContent = videoMatch[1];

      const getTag = (tag: string): string => {
        const cdataRegex = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
        const m1 = vContent.match(cdataRegex);
        if (m1) return m1[1].trim();

        const plainRegex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const m2 = vContent.match(plainRegex);
        if (m2) return m2[1].trim();
        return '';
      };

      const name = getTag('name');
      const id = parseInt(getTag('id') || '0', 10);
      const tid = parseInt(getTag('tid') || '0', 10);
      const typeName = getTag('type');
      const pic = getTag('pic');
      const lang = getTag('lang');
      const area = getTag('area');
      const year = getTag('year');
      const state = parseInt(getTag('state') || '0', 10);
      const note = getTag('note');
      const actor = getTag('actor');
      const director = getTag('director');
      const des = getTag('des');

      // 提取 <dl> 中的 <dd flag="...">
      const playFroms: string[] = [];
      const playUrls: string[] = [];

      const ddRegex = /<dd\s+flag="([^"]+)">\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/dd>/gi;
      let ddMatch;
      while ((ddMatch = ddRegex.exec(vContent)) !== null) {
        const flag = ddMatch[1].trim();
        const urlStr = (ddMatch[2] !== undefined ? ddMatch[2] : ddMatch[3] || '').trim();
        playFroms.push(flag);
        playUrls.push(urlStr);
      }

      result.list.push({
        vod_id: id,
        type_id: tid,
        type_name: typeName,
        vod_name: name,
        vod_pic: pic,
        vod_lang: lang,
        vod_area: area,
        vod_year: year,
        vod_remarks: note,
        vod_actor: actor,
        vod_director: director,
        vod_content: des,
        vod_isend: state,
        vod_play_from: playFroms.join('$$$'),
        vod_play_url: playUrls.join('$$$'),
        vod_play_server: playFroms.map(() => 'no').join('$$$'),
        vod_play_note: playFroms.map(() => '').join('$$$'),
      });
    }

    if (result.total === 0 && result.list.length > 0) {
      result.total = result.list.length;
    }

    return result;
  }
}
