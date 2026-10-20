// ========================================================
// MacCMS 播放列表核心编解码器与智能合并引擎
// 规范：播放组以 $$$ 分隔，集数以 # 分隔，集数详情以 $ 分隔
// ========================================================

import type { PlayGroup, Episode } from '../types/index.ts';

const SPECIAL_PINYIN: Record<string, string> = {
  '重': 'C', '长': 'C', '解': 'J', '单': 'S', '乐': 'Y', '朴': 'P', '仇': 'Q', '查': 'Z',
  '流': 'L', '繁': 'F', '奥': 'A', '间': 'J', '沙': 'S', '白': 'B', '黑': 'H', '红': 'H',
  '大': 'D', '小': 'X', '中': 'Z', '国': 'G', '美': 'M', '日': 'R', '韩': 'H', '欧': 'O',
  '爱': 'A', '情': 'Q', '喜': 'X', '剧': 'J', '动': 'D', '作': 'Z', '科': 'K', '幻': 'H',
  '恐': 'K', '怖': 'B', '战': 'Z', '争': 'Z', '连': 'L', '续': 'X', '综': 'Z', '艺': 'Y',
  '漫': 'M', '画': 'H', '纪': 'J', '录': 'L', '片': 'P', '新': 'X', '闻': 'W', '专': 'Z',
  '题': 'T', '星': 'X', '角': 'J', '色': 'S', '演': 'Y', '员': 'Y', '导': 'D', '阿': 'A',
  '汪': 'W', '吴': 'W', '胡': 'H', '李': 'L', '王': 'W', '张': 'Z', '刘': 'L', '陈': 'C',
  '杨': 'Y', '赵': 'Z', '黄': 'H', '周': 'Z', '徐': 'X', '孙': 'S', '马': 'M', '朱': 'Z'
};

const PINYIN_BOUNDARIES: [string, string][] = [
  ['啊', 'A'], ['芭', 'B'], ['擦', 'C'], ['搭', 'D'], ['蛾', 'E'],
  ['发', 'F'], ['噶', 'G'], ['哈', 'H'], ['击', 'J'], ['喀', 'K'],
  ['垃', 'L'], ['妈', 'M'], ['拿', 'N'], ['哦', 'O'], ['啪', 'P'],
  ['期', 'Q'], ['然', 'R'], ['撒', 'S'], ['塌', 'T'], ['挖', 'W'],
  ['昔', 'X'], ['压', 'Y'], ['匝', 'Z']
];

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
        // 已有播放线路：按集数名称与 URL 组合去重合并
        const curGroup = groupMap.get(inGroup.from)!;
        const seenUrls = new Set(curGroup.urls.map(u => u.url.trim()));
        const seenNames = new Set(curGroup.urls.map(u => u.name.trim()));

        for (const inEp of inGroup.urls) {
          const u = inEp.url.trim();
          const n = inEp.name.trim();

          // 如果该集数既未出现过相同的 URL，也未出现过相同的集数名，则追加
          if (!seenUrls.has(u) && !seenNames.has(n)) {
            curGroup.urls.push({
              ...inEp,
              nid: curGroup.urls.length + 1,
            });
            seenUrls.add(u);
            seenNames.add(n);
          } else if (!seenUrls.has(u) && seenNames.has(n)) {
            // 集名相同但 URL 发生变化：更新该集的 URL（支持上游源修复更新）
            const targetEp = curGroup.urls.find(item => item.name.trim() === n);
            if (targetEp) {
              targetEp.url = u;
            } else {
              curGroup.urls.push({ ...inEp, nid: curGroup.urls.length + 1 });
            }
            seenUrls.add(u);
          }
        }
      }
    }

    return Array.from(groupMap.values());
  }

  /**
   * 获取中文字符串的首字母 (规范汉字拼音首字母 A-Z 或英文数字提取)
   */
  static getFirstLetter(str: string): string {
    if (!str || !str.trim()) return '';
    const char = str.trim().charAt(0);

    // 1. 英文字母直接大写返回
    if (/^[a-zA-Z]$/.test(char)) {
      return char.toUpperCase();
    }

    // 2. 数字直接返回
    if (/^[0-9]$/.test(char)) {
      return char;
    }

    // 3. 常见影视词高频汉字字典直出
    if (SPECIAL_PINYIN[char]) {
      return SPECIAL_PINYIN[char];
    }

    // 4. Unicode / 拼音边界音序比对
    try {
      if (char.localeCompare('啊', 'zh-Hans-CN') < 0) {
        return 'A';
      }
      for (let i = PINYIN_BOUNDARIES.length - 1; i >= 0; i--) {
        if (char.localeCompare(PINYIN_BOUNDARIES[i][0], 'zh-Hans-CN') >= 0) {
          return PINYIN_BOUNDARIES[i][1];
        }
      }
    } catch {
      // 容错降级
    }

    // 5. 兜底非汉字标点或未能匹配的字符
    return 'A';
  }
}
