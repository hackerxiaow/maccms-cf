// ========================================================
// MacCMS 官方标准对外提供接口 (Provide API)
// 路径兼容：/api.php/provide/vod/ 与 /provide/vod/
// 支持格式：XML (RSS 5.1/2.0) 与 JSON
// ========================================================

import { Hono } from 'hono';
import { Bindings } from '../types';
import { VodService } from '../services/vod';
import { MacXmlUtils } from '../utils/xml';

export const provideRouter = new Hono<{ Bindings: Bindings }>();

// 核心处理函数
const handleProvideVod = async (c: any) => {
  const query = c.req.query();
  const ac = query.ac || 'list';
  const page = Math.max(1, parseInt(query.pg || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const typeId = query.t ? parseInt(query.t, 10) : 0;
  const hours = query.h ? parseInt(query.h, 10) : 0;
  const wd = query.wd?.trim() || '';
  const idsStr = query.ids?.trim() || '';
  const isXml = query.at === 'xml';

  const ids = idsStr ? idsStr.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0) : undefined;

  const db = c.env.DB;

  // 1. 查询视频数据
  const result = await VodService.queryVods(db, {
    page,
    limit,
    typeId,
    hours,
    wd,
    ids,
    status: 1, // 仅输出审核通过的视频
  });

  // 2. 查询全部分类供返回
  const types = await VodService.getTypes(db);

  // 展开扁平分类字典
  const flatTypes: { type_id: number; type_name: string; type_pid: number }[] = [];
  for (const t of types) {
    flatTypes.push({ type_id: t.type_id, type_name: t.type_name, type_pid: t.type_pid });
    if (t.children && t.children.length > 0) {
      for (const sub of t.children) {
        flatTypes.push({ type_id: sub.type_id, type_name: sub.type_name, type_pid: sub.type_pid });
      }
    }
  }

  const isDetail = ac === 'videolist' || ac === 'detail';

  // 3. XML 格式输出分支
  if (isXml) {
    const xml = MacXmlUtils.buildRssXml(
      result.list,
      flatTypes as any,
      result.page,
      result.pagecount,
      result.limit,
      result.total,
      isDetail
    );

    return c.text(xml, 200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    });
  }

  // 4. JSON 格式输出分支
  const typeMap = new Map<number, string>(flatTypes.map(t => [t.type_id, t.type_name]));

  const formattedList = result.list.map(v => {
    const item: Record<string, any> = {
      vod_id: v.vod_id,
      vod_name: v.vod_name,
      type_id: v.type_id,
      type_name: typeMap.get(v.type_id) || '',
      vod_en: v.vod_en || '',
      vod_time: v.vod_time > 0
        ? new Date(v.vod_time * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '',
      vod_remarks: v.vod_remarks || '',
      vod_play_from: (v.vod_play_from || '').replace(/\$\$\$/g, ','),
    };

    if (isDetail) {
      item.vod_pic = v.vod_pic || '';
      item.vod_actor = v.vod_actor || '';
      item.vod_director = v.vod_director || '';
      item.vod_blurb = v.vod_blurb || '';
      item.vod_content = v.vod_content || '';
      item.vod_pubdate = v.vod_pubdate || '';
      item.vod_area = v.vod_area || '';
      item.vod_lang = v.vod_lang || '';
      item.vod_year = v.vod_year || '';
      item.vod_douban_score = v.vod_douban_score || 0;
      item.vod_score = v.vod_score || 9.0;
      item.vod_isend = v.vod_isend || 0;
      item.vod_play_server = v.vod_play_server || '';
      item.vod_play_note = v.vod_play_note || '';
      item.vod_play_url = v.vod_play_url || '';
      item.vod_down_from = v.vod_down_from || '';
      item.vod_down_url = v.vod_down_url || '';
    }

    return item;
  });

  const responseJson: Record<string, any> = {
    code: 1,
    msg: '数据列表',
    page: result.page,
    pagecount: result.pagecount,
    limit: String(result.limit),
    total: result.total,
    list: formattedList,
  };

  if (ac === 'list') {
    responseJson.class = flatTypes;
  }

  return c.json(responseJson, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  });
};

provideRouter.get('/vod', handleProvideVod);
provideRouter.get('/vod/*', handleProvideVod);
provideRouter.get('/', handleProvideVod);

// 文章资讯对外提供接口 (Provide Art API)
const handleProvideArt = async (c: any) => {
  const query = c.req.query();
  const page = Math.max(1, parseInt(query.pg || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const typeId = query.t ? parseInt(query.t, 10) : 0;
  const wd = query.wd?.trim() || '';

  const result = await VodService.queryArts(c.env.DB, { page, limit, typeId, wd });
  return c.json({
    code: 1,
    msg: '文章数据列表',
    page: result.page,
    pagecount: result.pagecount,
    limit: String(result.limit),
    total: result.total,
    list: result.list,
  }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  });
};

provideRouter.get('/art', handleProvideArt);
provideRouter.get('/art/*', handleProvideArt);


