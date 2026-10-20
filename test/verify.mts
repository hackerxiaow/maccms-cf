// ========================================================
// 单元与功能验证脚本 (验证编解码、智能合并、XML生成与认证)
// ========================================================

import { MacPlayUrlParser } from '../src/utils/parser.ts';
import { MacXmlUtils } from '../src/utils/xml.ts';
import { AuthUtils } from '../src/utils/auth.ts';
import assert from 'node:assert';

console.log('>>> 正在运行 MacCMS 协议与核心逻辑测试...');

// 1. 测试 MacPlayUrlParser.parse 与 serialize
const sampleFrom = 'dplayer$$$kkm3u8';
const sampleUrl = '第01集$http://a.m3u8#第02集$http://b.m3u8$$$01$http://c.m3u8';
const sampleServer = 'no$$$no';
const sampleNote = '线路1$$$线路2';

const groups = MacPlayUrlParser.parse(sampleFrom, sampleUrl, sampleServer, sampleNote);
assert.strictEqual(groups.length, 2, '应成功解析两个播放组');
assert.strictEqual(groups[0].from, 'dplayer');
assert.strictEqual(groups[0].urls.length, 2);
assert.strictEqual(groups[0].urls[0].name, '第01集');
assert.strictEqual(groups[0].urls[0].url, 'http://a.m3u8');
assert.strictEqual(groups[1].from, 'kkm3u8');
assert.strictEqual(groups[1].urls.length, 1);
assert.strictEqual(groups[1].urls[0].name, '01');

console.log('✓ MacPlayUrlParser.parse 解码校验通过');

const serialized = MacPlayUrlParser.serialize(groups);
assert.strictEqual(serialized.vod_play_from, sampleFrom);
assert.strictEqual(serialized.vod_play_url, sampleUrl);
console.log('✓ MacPlayUrlParser.serialize 还原序列化校验通过');

// 2. 测试 MacCMS v10 智能合并 (urlrole=1)
const existingGroups = [
  {
    from: 'dplayer',
    server: 'no',
    note: '',
    urls: [
      { nid: 1, name: '第01集', url: 'http://old.com/1.m3u8' },
      { nid: 2, name: '第02集', url: 'http://old.com/2.m3u8' },
    ],
  },
];

const incomingGroups = [
  {
    from: 'dplayer', // 相同播放源，更新了第03集，同时第02集重复
    server: 'no',
    note: '',
    urls: [
      { nid: 1, name: '第02集', url: 'http://old.com/2.m3u8' },
      { nid: 2, name: '第03集', url: 'http://new.com/3.m3u8' },
    ],
  },
  {
    from: 'kkm3u8', // 新播放源
    server: 'no',
    note: '',
    urls: [{ nid: 1, name: '01', url: 'http://kk.com/1.m3u8' }],
  },
];

const merged = MacPlayUrlParser.mergeGroups(existingGroups, incomingGroups);
assert.strictEqual(merged.length, 2, '合并后应包含 2 个播放组');
const mergedDp = merged.find(g => g.from === 'dplayer');
assert.strictEqual(mergedDp!.urls.length, 3, '已去重合并，集数应为 3 集');
assert.strictEqual(mergedDp!.urls[2].name, '第03集');
const mergedKk = merged.find(g => g.from === 'kkm3u8');
assert.strictEqual(mergedKk!.urls.length, 1, '新源应自动追加');

console.log('✓ MacCMS v10 urlrole=1 智能合并与追加校验通过');

// 3. 测试 XML 生成与解析 (RSS 5.1 / 2.0 往返)
const testVideos: any[] = [
  {
    vod_id: 101,
    type_id: 1,
    vod_name: '测试大片',
    vod_pic: 'http://test.com/pic.jpg',
    vod_lang: '国语',
    vod_area: '中国',
    vod_year: '2025',
    vod_remarks: 'HD',
    vod_actor: '张三,李四',
    vod_director: '王五',
    vod_content: '精彩故事',
    vod_isend: 1,
    vod_time: 1729400000,
    vod_play_from: 'dplayer',
    vod_play_url: '正片$http://test.com/play.m3u8',
  },
];

const testTypes: any[] = [{ type_id: 1, type_name: '动作片' }];

const xmlOutput = MacXmlUtils.buildRssXml(testVideos, testTypes, 1, 1, 20, 1, true);
assert(xmlOutput.includes('<rss version="5.1">'), '应包含 RSS 5.1 根标签');
assert(xmlOutput.includes('<name><![CDATA[测试大片]]></name>'), '片名应包含 CDATA');
assert(xmlOutput.includes('<dd flag="dplayer">'), '应包含播放源 dd 标签');

const parsedXml = MacXmlUtils.parseRssXml(xmlOutput);
assert.strictEqual(parsedXml.list.length, 1);
assert.strictEqual(parsedXml.list[0].vod_name, '测试大片');
assert.strictEqual(parsedXml.list[0].vod_play_from, 'dplayer');
assert(parsedXml.list[0].vod_play_url.includes('http://test.com/play.m3u8'));

console.log('✓ MacXmlUtils RSS 5.1 XML 构建与反向解析校验通过');

// 4. 测试 AuthUtils SHA-256 与 Token 签发校验
const hash = await AuthUtils.sha256('admin888');
assert.strictEqual(
  hash,
  'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373',
  'SHA-256 哈希值应与预设标准匹配'
);

const secret = 'test-secret-key-123';
const token = await AuthUtils.generateToken('admin', secret);
assert(token && token.includes('.'), 'Token 应包含载荷与签名两段');
const isValid = await AuthUtils.verifyToken(token, secret);
assert.strictEqual(isValid, true, '正确密钥应验签成功');
const isInvalid = await AuthUtils.verifyToken(token, 'wrong-secret');
assert.strictEqual(isInvalid, false, '错误密钥应验签失败');

console.log('✓ AuthUtils 散列与 Session Token 鉴权校验通过');

console.log('====================================================');
console.log('🎉 全部单元与协议测试 100% 通过！');
console.log('====================================================');
