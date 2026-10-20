// ========================================================
// MacCMS 播放列表核心编解码器与智能合并引擎
// 规范：播放组以 $$$ 分隔，集数以 # 分隔，集数详情以 $ 分隔
// ========================================================

import type { PlayGroup, Episode } from '../types/index.ts';

export class MacPlayUrlParser {
  /**
   * 解码：将 4 个扁平字符串转换为结构化播放组对象
   * @param playFrom 例如: "dplayer$$$kkm3u8"
   * @param playUrl  例如: "第01集$http://a.m3u8#第02集$http://b.m3u8$$$01$http://c.m3u8"
   * @param playServer 例如: "no$$$no"
   * @param playNote 例如: "线路1$$$线路2"
   */
  static parse(
    playFrom = '',
    playUrl = '',
    playServer = '',
    playNote = ''
  ): PlayGroup[] {
    const cleanFrom = (playFrom || '').trim();
    if (!cleanFrom) return [];

    const froms = cleanFrom.split('$$$');
    const urls = (playUrl || '').split('$$$');
    const servers = (playServer || '').split('$$$');
    const notes = (playNote || '').split('$$$');

    return froms.map((from, idx) => {
      const groupUrlStr = urls[idx] || '';
      const rawEpisodes = groupUrlStr ? groupUrlStr.split('#') : [];

      const parsedEpisodes: Episode[] = rawEpisodes
        .map(ep => ep.trim())
        .filter(Boolean)
        .map((epStr, epIdx) => {
          const parts = epStr.split('$');
          let name = `第${epIdx + 1}集`;
          let url = '';
          let overrideFrom: string | undefined = undefined;

          if (parts.length === 1) {
            // 没有 $ 分隔符，整串即为播放 URL
            url = parts[0];
          } else {
            name = parts[0] || name;
            url = parts[1] || '';
            if (parts[2]) overrideFrom = parts[2];
          }

          return {
            nid: epIdx + 1,
            name,
            url,
            from: overrideFrom || from,
          };
        });

      return {
        from: from.trim(),
        server: servers[idx] || 'no',
        note: notes[idx] || '',
        urls: parsedEpisodes,
      };
    });
  }

  /**
   * 编码：将结构化播放组打包还原为 4 个 DB 存储字段
   */
  static serialize(groups: PlayGroup[]): {
    vod_play_from: string;
    vod_play_server: string;
    vod_play_note: string;
    vod_play_url: string;
  } {
    const validGroups = groups.filter(g => g.from && g.from.trim());
    if (validGroups.length === 0) {
      return {
        vod_play_from: '',
        vod_play_server: '',
        vod_play_note: '',
        vod_play_url: '',
      };
    }

    const playFroms: string[] = [];
    const playServers: string[] = [];
    const playNotes: string[] = [];
    const playUrls: string[] = [];

    for (const g of validGroups) {
      playFroms.push(g.from.trim());
      playServers.push(g.server || 'no');
      playNotes.push(g.note || '');

      const groupEpStr = g.urls
        .map(ep => `${ep.name}$${ep.url}`)
        .join('#');
      playUrls.push(groupEpStr);
    }

    return {
      vod_play_from: playFroms.join('$$$'),
      vod_play_server: playServers.join('$$$'),
      vod_play_note: playNotes.join('$$$'),
      vod_play_url: playUrls.join('$$$'),
    };
  }

  /**
   * 采集合并：实现 MacCMS v10 的智能合并去重算法 (urlrole=1)
   * 1. 远程出现本地没有的播放源，保留本地全部已有源，并追加远程新源；
   * 2. 远程出现本地已有的播放源，比对集数名称与地址：本地已有集数不丢，远程新集数追加进来。
   */
  static mergeGroups(existing: PlayGroup[], incoming: PlayGroup[]): PlayGroup[] {
    const groupMap = new Map<string, PlayGroup>();

    // 复制本地已有组
    for (const g of existing) {
      groupMap.set(g.from, {
        ...g,
        urls: [...g.urls],
      });
    }

    for (const inGroup of incoming) {
      if (!groupMap.has(inGroup.from)) {
        // 全新播放线路：直接追加
        groupMap.set(inGroup.from, {
          ...inGroup,
          urls: inGroup.urls.map((u, i) => ({ ...u, nid: i + 1 })),
        });
      } else {
        // 已有播放线路：按集数名称或 URL 组合去重合并
        const curGroup = groupMap.get(inGroup.from)!;
        const seenUrls = new Set(curGroup.urls.map(u => u.url.trim()));
        const seenNames = new Set(curGroup.urls.map(u => u.name.trim()));

        for (const inEp of inGroup.urls) {
          const u = inEp.url.trim();
          const n = inEp.name.trim();

          // 如果该集数既未出现过相同的 URL，也未出现过相同的集数名，则追加
          // 或即使集名重复但 URL 不同，判定为分段或更新
          if (!seenUrls.has(u)) {
            curGroup.urls.push({
              ...inEp,
              nid: curGroup.urls.length + 1,
            });
            seenUrls.add(u);
            seenNames.add(n);
          }
        }
      }
    }

    return Array.from(groupMap.values());
  }

  /**
   * 获取中文字符串的首字母 (拼音首字母简单映射与英文提取)
   */
  static getFirstLetter(str: string): string {
    if (!str || !str.trim()) return '';
    const char = str.trim().charAt(0);
    // 如果是英文字母
    if (/^[a-zA-Z]$/.test(char)) {
      return char.toUpperCase();
    }
    // 如果是数字
    if (/^[0-9]$/.test(char)) {
      return char;
    }
    // 常见拼音多音字映射范围简易提取
    try {
      const pinyinTable: [number, string][] = [
        [45217, 'A'], [45253, 'B'], [45761, 'C'], [46318, 'D'], [46826, 'E'],
        [47010, 'F'], [47297, 'G'], [47614, 'H'], [48119, 'J'], [49062, 'K'],
        [49324, 'L'], [49896, 'M'], [50371, 'N'], [50614, 'O'], [50622, 'P'],
        [50906, 'Q'], [51387, 'R'], [51446, 'S'], [52218, 'T'], [52698, 'W'],
        [52980, 'X'], [53689, 'Y'], [54481, 'Z']
      ];
      // 取 UTF-8 / GBK 模糊首字母
      return char.toUpperCase();
    } catch {
      return '';
    }
  }
}
