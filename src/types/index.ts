// ========================================================
// MacCMS 核心实体与类型定义
// ========================================================

export type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
  SITE_NAME?: string;
  SITE_URL?: string;
  ADMIN_PASSWORD?: string;
};

export interface TypeItem {
  type_id: number;
  type_name: string;
  type_en: string;
  type_sort: number;
  type_mid: number; // 1=视频, 2=文章, 3=专题
  type_pid: number; // 父分类ID
  type_status: number;
  type_tpl: string;
  type_extend?: string;
  children?: TypeItem[];
}

export interface VodItem {
  vod_id: number;
  type_id: number;
  type_id_1: number;
  type_name?: string;
  vod_name: string;
  vod_sub: string;
  vod_en: string;
  vod_status: number;
  vod_letter: string;
  vod_tag: string;
  vod_class: string;
  vod_pic: string;
  vod_pic_slide?: string; // 横版剧照 (巨幕背景图)
  vod_actor: string;
  vod_director: string;
  vod_writer: string;
  vod_blurb: string;
  vod_remarks: string;
  vod_pubdate: string;
  vod_area: string;
  vod_lang: string;
  vod_year: string;
  vod_content: string;
  vod_douban_id: number;
  vod_douban_score: number;
  vod_score: number;
  vod_score_num: number;
  vod_hits: number;
  vod_hits_day: number;
  vod_hits_week: number;
  vod_hits_month: number;
  vod_isend: number;
  vod_time: number;
  vod_time_add: number;
  // 播放与下载三美元符编码
  vod_play_from: string;
  vod_play_server: string;
  vod_play_note: string;
  vod_play_url: string;
  vod_down_from?: string;
  vod_down_server?: string;
  vod_down_note?: string;
  vod_down_url?: string;
  // 分集剧情
  vod_plot?: number;
  vod_plot_name?: string;
  vod_plot_detail?: string;
}

export interface Episode {
  nid: number;
  name: string;
  url: string;
  from?: string;
}

export interface PlayGroup {
  from: string;
  server: string;
  note: string;
  urls: Episode[];
}

export interface CollectNodeItem {
  id: number;
  name: string;
  api_url: string;
  api_type: 'json' | 'xml';
  filter_from: string;
  last_run_time: number;
  cron_hours: number;
  status: number;
}

export interface TypeBindItem {
  source_id: number;
  source_type_id: number;
  source_type_name: string;
  local_type_id: number;
}

export interface PlayerItem {
  id: number;
  code: string;
  name: string;
  parse_url: string;
  status: number;
  sort: number;
  tip: string;
}

export interface ArtItem {
  art_id: number;
  type_id: number;
  type_id_1: number;
  type_name?: string;
  art_name: string;
  art_sub: string;
  art_en: string;
  art_status: number;
  art_letter: string;
  art_tag: string;
  art_pic: string;
  art_author: string;
  art_from: string;
  art_blurb: string;
  art_content: string;
  art_hits: number;
  art_time: number;
  art_time_add: number;
  art_rel_vod: string;
}

export interface TopicItem {
  topic_id: number;
  topic_name: string;
  topic_en: string;
  topic_pic: string;
  topic_blurb: string;
  topic_content: string;
  topic_hits: number;
  topic_status: number;
  topic_sort: number;
  topic_rel_vod: string;
  topic_time: number;
}

export interface CommentItem {
  comment_id: number;
  comment_mid: number;
  comment_rid: number;
  comment_name: string;
  comment_content: string;
  comment_time: number;
  comment_status: number;
}

export interface LinkItem {
  link_id: number;
  link_name: string;
  link_url: string;
  link_sort: number;
  link_status: number;
}

