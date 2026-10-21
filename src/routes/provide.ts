// ========================================================
// MacCMS 官方标准对外提供接口 (Provide API)
// 路径兼容：/api.php/provide/vod, /api.php/provide/art, /api.php/provide/actor, /api.php/provide/role
// 兼容经典 v8 规范：/inc/api.php, /inc/apijson.php, /inc/apixml.php
// 支持格式：XML (RSS 5.1/2.0) 与 JSON
// ========================================================

import { Hono } from 'hono';
import type { Bindings } from '../types/index.ts';
import { VodService } from '../services/vod.ts';
import { ActorService } from '../services/actor.ts';
import { MacXmlUtils } from '../utils/xml.ts';
import { WebsiteService } from '../services/website.ts';
import { MangaService } from '../services/manga.ts';
import { ContentTranslationService } from '../services/content-translation.ts';

export const provideVodRouter = new Hono<{ Bindings: Bindings }>();
export const provideArtRouter = new Hono<{ Bindings: Bindings }>();
export const provideActorRouter = new Hono<{ Bindings: Bindings }>();
export const provideRoleRouter = new Hono<{ Bindings: Bindings }>();
export const provideWebsiteRouter = new Hono<{ Bindings: Bindings }>();
export const provideMangaRouter = new Hono<{ Bindings: Bindings }>();
export const incApiRouter = new Hono<{ Bindings: Bindings }>();

// 1. 核心 VOD 接口处理函数 (兼容 v8/v10 参数)
export const handleProvideVod = async (c: any) => {
  const query = c.req.query();
  // v8 兼容：action 映射为 ac，rday 映射为 h (rday * 24)，xt=1 映射为 at=xml
  const ac = query.ac || query.action || 'list';
  const page = Math.max(1, parseInt(query.pg || query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const typeId = query.t ? parseInt(query.t, 10) : 0;
  let hours = query.h ? parseInt(query.h, 10) : 0;
  if (!hours && query.rday) {
    hours = parseInt(query.rday, 10) * 24;
  }
  const wd = query.wd?.trim() || '';
  const idsStr = query.ids?.trim() || '';
  const isXml =
    (query.at === 'xml' || query.xt === '1' || c.req.path.endsWith('/apixml.php')) &&
    !c.req.path.endsWith('/apijson.php');
  if (isXml) {
    const config = await VodService.getConfigs(c.env.DB, new URL(c.req.url).hostname);
    if (config.app_allow_xml === '0') return c.json({ code: 403, msg: '站点已关闭 XML 提供接口' }, 403);
  }
  const filterPlay = (query.play || '').trim().toLowerCase();

  const ids = idsStr ? idsStr.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0) : undefined;
  const db = c.env.DB;

  // 查询视频数据
  const result = await VodService.queryVods(db, {
    page,
    limit,
    typeId,
    hours,
    wd,
    ids,
    status: 1,
  });
  result.list = await ContentTranslationService.apply(db, 'vod', result.list, query.lang);

  // 播放源过滤 (v8 特性)
  if (filterPlay) {
    result.list = result.list.filter(v => (v.vod_play_from || '').toLowerCase().includes(filterPlay));
  }

  // 查询全部分类
  const types = await VodService.getTypes(db, 1);
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

  // XML 格式输出分支
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

  // JSON 格式输出分支
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
      item.vod_sub = v.vod_sub || '';
      item.vod_color = v.vod_color || '';
      item.vod_tag = v.vod_tag || '';
      item.vod_class = v.vod_class || '';
      item.vod_pic = v.vod_pic || '';
      item.vod_pic_slide = v.vod_pic_slide || '';
      item.vod_actor = v.vod_actor || '';
      item.vod_director = v.vod_director || '';
      item.vod_writer = v.vod_writer || '';
      item.vod_behind = v.vod_behind || '';
      item.vod_blurb = v.vod_blurb || '';
      item.vod_content = v.vod_content || '';
      item.vod_pubdate = v.vod_pubdate || '';
      item.vod_total = v.vod_total || 0;
      item.vod_serial = v.vod_serial || '';
      item.vod_tv = v.vod_tv || '';
      item.vod_weekday = v.vod_weekday || 0;
      item.vod_area = v.vod_area || '';
      item.vod_lang = v.vod_lang || '';
      item.vod_year = v.vod_year || '';
      item.vod_version = v.vod_version || '';
      item.vod_state = v.vod_state || '';
      item.vod_douban_id = v.vod_douban_id || 0;
      item.vod_douban_score = v.vod_douban_score || 0;
      item.vod_score = v.vod_score || 9.0;
      item.vod_isend = v.vod_isend || 0;
      item.vod_play_server = v.vod_play_server || '';
      item.vod_play_note = v.vod_play_note || '';
      item.vod_play_url = v.vod_play_url || '';
      item.vod_down_from = v.vod_down_from || '';
      item.vod_down_server = v.vod_down_server || '';
      item.vod_down_note = v.vod_down_note || '';
      item.vod_down_url = v.vod_down_url || '';
      item.vod_plot = v.vod_plot || 0;
      item.vod_plot_name = v.vod_plot_name || '';
      item.vod_plot_detail = v.vod_plot_detail || '';
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

provideVodRouter.get('/', handleProvideVod);
provideVodRouter.get('/*', handleProvideVod);

// 2. 核心 Art 接口处理函数
export const handleProvideArt = async (c: any) => {
  const query = c.req.query();
  const page = Math.max(1, parseInt(query.pg || query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const typeId = query.t ? parseInt(query.t, 10) : 0;
  const wd = query.wd?.trim() || '';

  const result = await VodService.queryArts(c.env.DB, { page, limit, typeId, wd });
  const types = await VodService.getTypes(c.env.DB, 2);

  return c.json({
    code: 1,
    msg: '文章数据列表',
    page: result.page,
    pagecount: result.pagecount,
    limit: String(result.limit),
    total: result.total,
    list: await ContentTranslationService.apply(c.env.DB, 'art', result.list, query.lang),
    class: types,
  }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  });
};

provideArtRouter.get('/', handleProvideArt);
provideArtRouter.get('/*', handleProvideArt);

// 3. 明星 Actor 开放接口
export const handleProvideActor = async (c: any) => {
  const query = c.req.query();
  const page = Math.max(1, parseInt(query.pg || query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const wd = query.wd?.trim() || '';

  const result = await ActorService.queryActors(c.env.DB, { page, limit, wd });
  return c.json({
    code: 1,
    msg: '明星数据列表',
    page: result.page,
    pagecount: result.pagecount,
    limit: String(result.limit),
    total: result.total,
    list: await ContentTranslationService.apply(c.env.DB, 'actor', result.list, query.lang),
  }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  });
};

provideActorRouter.get('/', handleProvideActor);
provideActorRouter.get('/*', handleProvideActor);

// 4. 角色 Role 开放接口
export const handleProvideRole = async (c: any) => {
  const query = c.req.query();
  const page = Math.max(1, parseInt(query.pg || query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
  const wd = query.wd?.trim() || '';

  const result = await ActorService.queryRoles(c.env.DB, { page, limit, wd });
  return c.json({
    code: 1,
    msg: '角色数据列表',
    page: result.page,
    pagecount: result.pagecount,
    limit: String(result.limit),
    total: result.total,
    list: await ContentTranslationService.apply(c.env.DB, 'role', result.list, query.lang),
  }, 200, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  });
};

provideRoleRouter.get('/', handleProvideRole);
provideRoleRouter.get('/*', handleProvideRole);

// 4.1 MacCMS v8/v10 网址导航开放接口
export const handleProvideWebsite = async (c: any) => {
  const q = c.req.query();
  if (q.at === 'xml' || q.xt === '1') {
    const config = await VodService.getConfigs(c.env.DB, new URL(c.req.url).hostname);
    if (config.app_allow_xml === '0') return c.json({ code: 403, msg: '站点已关闭 XML 提供接口' }, 403);
  }
  const page = Math.max(1, parseInt(q.pg || q.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(q.limit || '20', 10)));
  const ids = String(q.ids || '').split(',').map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
  const result = await WebsiteService.query(c.env.DB, {
    page,
    limit,
    typeId: q.t ? parseInt(q.t, 10) : undefined,
    wd: q.wd,
    status: 1,
    ids: ids.length ? ids : undefined,
  });
  const typeTree = await VodService.getTypes(c.env.DB, 11);
  const types = typeTree.flatMap((type: any) => [
    { type_id: type.type_id, type_name: type.type_name, type_pid: type.type_pid },
    ...(type.children || []).map((child: any) => ({ type_id: child.type_id, type_name: child.type_name, type_pid: child.type_pid })),
  ]);
  const translated = await ContentTranslationService.apply(c.env.DB, 'website', result.list, q.lang);
  const list = translated.map((item: any) => ({
    ...item,
    website_time: item.website_time > 0
      ? new Date(item.website_time * 1000).toISOString().replace('T', ' ').slice(0, 19)
      : '',
  }));

  if (q.at === 'xml' || q.xt === '1') {
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const cdata = (value: unknown) => `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<rss version="5.1"><list page="${page}" pagecount="${result.pagecount}" pagesize="${limit}" recordcount="${result.total}">`;
    for (const item of list) {
      xml += `<website><last>${esc(item.website_time)}</last><id>${item.website_id}</id><tid>${item.type_id}</tid>` +
        `<name>${cdata(item.website_name)}</name><sub>${cdata(item.website_sub)}</sub><en>${esc(item.website_en)}</en>` +
        `<letter>${esc(item.website_letter)}</letter><url>${esc(item.website_url)}</url><pic>${esc(item.website_pic)}</pic>` +
        `<logo>${esc(item.website_logo)}</logo><jumpurl>${esc(item.website_jumpurl)}</jumpurl></website>`;
    }
    xml += '</list><class>' + types.map((t: any) => `<ty id="${t.type_id}">${esc(t.type_name)}</ty>`).join('') + '</class></rss>';
    return c.text(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
  }

  return c.json({
    code: 1,
    msg: '网址数据列表',
    page,
    pagecount: result.pagecount,
    limit: String(limit),
    total: result.total,
    list,
    class: types,
  }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' });
};

provideWebsiteRouter.get('/', handleProvideWebsite);
provideWebsiteRouter.get('/*', handleProvideWebsite);

// MacCMS10 漫画模型 Provide API。JSON/XML 输出均使用 D1 中的原始 manga 字段。
export const handleProvideManga = async (c: any) => {
  const q = c.req.query();
  const xmlMode = q.at === 'xml' || q.xt === '1';
  if (xmlMode) {
    const config = await VodService.getConfigs(c.env.DB, new URL(c.req.url).hostname);
    if (config.app_allow_xml === '0') return c.json({ code: 403, msg: '站点已关闭 XML 提供接口' }, 403);
  }
  const page = Math.max(1, parseInt(q.pg || q.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit || '20', 10) || 20));
  const result = await MangaService.query(c.env.DB, { page, limit, typeId: q.t ? parseInt(q.t, 10) : undefined, wd: q.wd, status: 1 });
  result.list = await ContentTranslationService.apply(c.env.DB, 'manga', result.list, q.lang);
  const typesTree = await VodService.getTypes(c.env.DB, 12);
  const types = typesTree.flatMap((type: any) => [
    { type_id: type.type_id, type_name: type.type_name, type_pid: type.type_pid },
    ...(type.children || []).map((child: any) => ({ type_id: child.type_id, type_name: child.type_name, type_pid: child.type_pid })),
  ]);
  if (xmlMode) {
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const cdata = (value: unknown) => `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<rss version="5.1"><list page="${page}" pagecount="${result.pagecount}" pagesize="${limit}" recordcount="${result.total}">`;
    for (const item of result.list as any[]) {
      xml += `<manga><last>${esc(item.manga_time)}</last><id>${item.manga_id}</id><tid>${item.type_id}</tid>` +
        `<name>${cdata(item.manga_name)}</name><sub>${cdata(item.manga_sub)}</sub><en>${esc(item.manga_en)}</en>` +
        `<letter>${esc(item.manga_letter)}</letter><pic>${esc(item.manga_pic)}</pic><author>${cdata(item.manga_author)}</author>` +
        `<remarks>${cdata(item.manga_remarks)}</remarks><blurb>${cdata(item.manga_blurb)}</blurb>` +
        `<chapterfrom>${esc(item.manga_chapter_from)}</chapterfrom><chapterurl>${cdata(item.manga_chapter_url)}</chapterurl></manga>`;
    }
    xml += '</list><class>' + types.map((type: any) => `<ty id="${type.type_id}">${esc(type.type_name)}</ty>`).join('') + '</class></rss>';
    return c.text(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
  }
  return c.json({ code: 1, msg: '漫画数据列表', page, pagecount: result.pagecount, limit: String(limit), total: result.total,
    list: result.list, class: types }, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' });
};

provideMangaRouter.get('/', handleProvideManga);
provideMangaRouter.get('/*', handleProvideManga);

// 5. 经典 v8 路由入口适配 (apixml.php / apijson.php 由 handleProvideVod 依据 path 判定输出格式)
incApiRouter.get('/api.php', handleProvideVod);
incApiRouter.get('/apijson.php', handleProvideVod);
incApiRouter.get('/apixml.php', handleProvideVod);
