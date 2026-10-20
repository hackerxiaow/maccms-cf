// ========================================================
// MacCMS 核心实体与类型定义 (全量对齐 MacCMS 10 & 8 规范)
// ========================================================

export type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
  MEDIA_BUCKET?: R2Bucket;
  SITE_NAME?: string;
  SITE_URL?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
};

export interface TypeItem {
  type_id: number;
  type_name: string;
  type_en: string;
  type_sort: number;
  type_mid: number; // 1=视频, 2=文章, 3=专题, 8=明星, 9=角色, 11=网址, 12=漫画
  type_pid: number; // 父分类ID (0为一级分类)
  type_status: number;
  type_tpl?: string;
  type_tpl_list?: string;
  type_tpl_detail?: string;
  type_tpl_play?: string;
  type_tpl_down?: string;
  type_title?: string;
  type_key?: string;
  type_des?: string;
  type_logo?: string;
  type_pic?: string;
  type_union?: string;
  type_extend?: string;
  children?: TypeItem[];
}

export interface MangaItem {
  manga_id: number;
  type_id: number;
  type_id_1: number;
  type_name?: string;
  group_id: number;
  manga_name: string;
  manga_sub: string;
  manga_en: string;
  manga_status: number;
  manga_letter: string;
  manga_color: string;
  manga_from: string;
  manga_author: string;
  manga_tag: string;
  manga_class: string;
  manga_pic: string;
  manga_pic_thumb: string;
  manga_pic_slide: string;
  manga_pic_screenshot: string;
  manga_blurb: string;
  manga_remarks: string;
  manga_jumpurl: string;
  manga_tpl: string;
  manga_level: number;
  manga_lock: number;
  manga_points: number;
  manga_points_detail: number;
  manga_rel_manga: string;
  manga_rel_vod: string;
  manga_pwd: string;
  manga_pwd_url: string;
  manga_content: string;
  manga_serial: string;
  manga_total: number;
  manga_chapter_from: string;
  manga_chapter_url: string;
  manga_last_update_time: number;
  manga_age_rating: number;
  manga_orientation: number;
  manga_is_vip: number;
  manga_copyright_info: string;
  manga_time: number;
  manga_time_add: number;
  manga_hits: number;
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
  vod_color?: string;
  vod_tag: string;
  vod_class: string;
  vod_pic: string;
  vod_pic_thumb?: string;
  vod_pic_slide?: string; // 横版剧照 (巨幕背景图)
  vod_pic_screenshot?: string;
  vod_actor: string;
  vod_director: string;
  vod_writer: string;
  vod_behind?: string;
  vod_blurb: string;
  vod_remarks: string;
  vod_pubdate: string;
  vod_total?: number;
  vod_serial?: string;
  vod_tv?: string;
  vod_weekday?: number;
  vod_area: string;
  vod_lang: string;
  vod_year: string;
  vod_version?: string;
  vod_state?: string;
  vod_duration?: string;
  vod_author?: string;
  vod_jumpurl?: string;
  vod_tpl?: string;
  vod_tpl_play?: string;
  vod_tpl_down?: string;
  vod_isend: number;
  vod_lock?: number; // 1=锁定采集不覆盖
  vod_level?: number; // 1-9 推荐级别
  vod_copyright?: number;
  group_id?: number;
  vod_points?: number;
  vod_points_play?: number;
  vod_points_down?: number;
  vod_trysee?: number;
  vod_pwd?: string;
  vod_pwd_play?: string;
  vod_pwd_down?: string;
  vod_content: string;
  vod_douban_id: number;
  vod_douban_score: number;
  vod_score: number;
  vod_score_all?: number;
  vod_score_num: number;
  vod_hits: number;
  vod_hits_day: number;
  vod_hits_week: number;
  vod_hits_month: number;
  vod_time_hits?: number;
  vod_up?: number;
  vod_down?: number;
  vod_time: number;
  vod_time_add: number;
  vod_time_make?: number;
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
  // 关系
  vod_rel_vod?: string;
  vod_rel_art?: string;
  vod_reurl?: string;
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
  filter_word?: string;
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
  player_title?: string;
  parse_url: string;
  player_parse2?: string;
  player_target?: string;
  player_content?: string;
  player_url?: string;
  status: number;
  sort: number;
  tip: string;
}

export interface DownerItem {
  id: number;
  code: string;
  name: string;
  status: number;
  sort: number;
  tip: string;
}

export interface ServerItem {
  id: number;
  code: string;
  name: string;
  status: number;
  sort: number;
  tip: string;
}

export interface ArtItem {
  art_id: number;
  type_id: number;
  type_id_1: number;
  type_name?: string;
  group_id?: number;
  art_name: string;
  art_sub: string;
  art_en: string;
  art_status: number;
  art_letter: string;
  art_color?: string;
  art_tag: string;
  art_lock?: number;
  art_level?: number;
  art_pic: string;
  art_pic_thumb?: string;
  art_pic_slide?: string;
  art_author: string;
  art_from: string;
  art_blurb: string;
  art_content: string;
  art_up?: number;
  art_down?: number;
  art_hits: number;
  art_hits_day?: number;
  art_hits_week?: number;
  art_hits_month?: number;
  art_score?: number;
  art_score_num?: number;
  art_time: number;
  art_time_add: number;
  art_rel_vod: string;
  art_rel_art?: string;
  art_pwd?: string;
  art_points?: number;
}

export interface TopicItem {
  topic_id: number;
  topic_name: string;
  topic_sub?: string;
  topic_en: string;
  topic_letter?: string;
  topic_color?: string;
  topic_tpl?: string;
  topic_pic: string;
  topic_pic_thumb?: string;
  topic_pic_slide?: string;
  topic_blurb: string;
  topic_content: string;
  topic_up?: number;
  topic_down?: number;
  topic_score?: number;
  topic_score_num?: number;
  topic_hits: number;
  topic_hits_day?: number;
  topic_hits_week?: number;
  topic_hits_month?: number;
  topic_status: number;
  topic_sort: number;
  topic_level?: number;
  topic_rel_vod: string;
  topic_rel_art?: string;
  topic_extend?: string;
  topic_time: number;
  topic_time_add?: number;
}

export interface ActorItem {
  actor_id: number;
  type_id: number;
  type_name?: string;
  actor_name: string;
  actor_en: string;
  actor_letter: string;
  actor_sex: string;
  actor_color?: string;
  actor_status: number;
  actor_lock?: number;
  actor_level?: number;
  actor_pic: string;
  actor_blurb: string;
  actor_remarks: string;
  actor_area: string;
  actor_height: string;
  actor_weight: string;
  actor_birthday: string;
  actor_birtharea: string;
  actor_blood: string;
  actor_starsign: string;
  actor_school: string;
  actor_works: string;
  actor_content: string;
  actor_hits: number;
  actor_up?: number;
  actor_down?: number;
  actor_score?: number;
  actor_time: number;
  actor_time_add: number;
}

export interface RoleItem {
  role_id: number;
  role_name: string;
  role_en: string;
  role_letter: string;
  role_status: number;
  role_lock?: number;
  role_level?: number;
  role_pic: string;
  role_actor_name: string;
  role_actor_id: number;
  role_vod_name: string;
  role_vod_id: number;
  role_remarks: string;
  role_content: string;
  role_hits: number;
  role_up?: number;
  role_down?: number;
  role_score?: number;
  role_time: number;
  role_time_add: number;
}

export interface WebsiteItem {
  website_id: number;
  type_id: number;
  type_name?: string;
  website_name: string;
  website_sub?: string;
  website_en: string;
  website_letter: string;
  website_url: string;
  website_pic?: string;
  website_logo?: string;
  website_jumpurl?: string;
  website_status: number;
  website_sort: number;
  website_level?: number;
  website_time: number;
  website_referer?: number;
}

export interface UserItem {
  user_id: number;
  group_id: number;
  group_name?: string;
  user_name: string;
  user_pwd?: string;
  user_nick: string;
  user_email: string;
  user_phone: string;
  user_status: number;
  user_points: number;
  user_reg_time: number;
  user_login_time: number;
  user_login_ip: string;
  user_last_login_time: number;
  user_last_login_ip: string;
  user_login_num: number;
  user_end_time: number; // VIP 到期时间戳
  user_pid: number;
}

export interface UserGroupItem {
  group_id: number;
  group_name: string;
  group_status: number;
  group_points_day: number;
  group_points_week: number;
  group_points_month: number;
  group_points_year: number;
  group_points_free: number;
  group_auth?: string;
}

export interface CardItem {
  card_id: number;
  card_no: string;
  card_pwd: string;
  card_money: number;
  card_points: number;
  card_use_status: number; // 0=未使用, 1=已使用
  user_id: number;
  user_name?: string;
  card_add_time: number;
  card_use_time: number;
}

export interface OrderItem {
  order_id: number;
  order_code: string;
  user_id: number;
  user_name?: string;
  order_status: number;
  order_price: number;
  order_time: number;
  order_points: number;
  order_pay_type: string;
}

export interface UlogItem {
  ulog_id: number;
  user_id: number;
  ulog_mid: number; // 1=vod, 2=art, 3=topic
  ulog_type: number; // 1=浏览历史, 2=收藏夹, 3=点播扣费, 4=下载扣费, 5=充值
  ulog_rid: number;
  ulog_sid: number;
  ulog_nid: number;
  ulog_points: number;
  ulog_time: number;
  target_name?: string;
  target_pic?: string;
}

export interface GbookItem {
  gbook_id: number;
  gbook_mid: number;
  gbook_rid: number;
  gbook_name: string;
  user_id: number;
  gbook_status: number; // 0=未审, 1=已审
  gbook_ip: string;
  gbook_time: number;
  gbook_reply_time: number;
  gbook_content: string;
  gbook_reply: string;
  vod_name: string;
  play_from: string;
  play_part: string;
}

export interface CommentItem {
  comment_id: number;
  comment_mid: number;
  comment_rid: number;
  comment_pid: number;
  user_id: number;
  comment_name: string;
  comment_ip?: string;
  comment_content: string;
  comment_time: number;
  comment_status: number;
  comment_up?: number;
  comment_down?: number;
  comment_report?: number;
  target_name?: string;
}

export interface LinkItem {
  link_id: number;
  link_name: string;
  link_url: string;
  link_logo?: string;
  link_type?: number;
  link_sort: number;
  link_status: number;
}

export interface AdsItem {
  ads_id: number;
  ads_key: string;
  ads_name: string;
  ads_content: string;
  ads_status: number;
  ads_sort: number;
  ads_time: number;
}

export interface ThemeConfigItem {
  cfg_key: string;
  cfg_value: string;
  cfg_group: string;
  cfg_title: string;
  cfg_type: 'text' | 'color' | 'number' | 'switch' | 'textarea';
}

export interface CjHistoryItem {
  id: number;
  node_id: number;
  page: number;
  total_page: number;
  total_records: number;
  last_time: number;
  status: number;
}
