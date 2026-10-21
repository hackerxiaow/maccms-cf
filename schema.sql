-- ========================================================
-- MacCMS Cloudflare D1 (SQLite) 数据库表结构与预设数据
-- 深度融合 MacCMS v8 经典生态与 MacCMS v10 完整功能矩阵
-- ========================================================

-- 1. 分类表 (统一分类模型 type_mid: 1=vod, 2=art, 3=topic, 8=actor, 9=role, 11=website, 12=manga)
CREATE TABLE IF NOT EXISTS type (
  type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_name TEXT NOT NULL,
  type_en TEXT NOT NULL DEFAULT '',
  type_sort INTEGER NOT NULL DEFAULT 0,
  type_mid INTEGER NOT NULL DEFAULT 1,
  type_pid INTEGER NOT NULL DEFAULT 0,  -- 0 表示顶级分类
  type_status INTEGER NOT NULL DEFAULT 1,
  type_tpl TEXT NOT NULL DEFAULT '',
  type_tpl_list TEXT NOT NULL DEFAULT '',
  type_tpl_detail TEXT NOT NULL DEFAULT '',
  type_tpl_play TEXT NOT NULL DEFAULT '',
  type_tpl_down TEXT NOT NULL DEFAULT '',
  type_title TEXT NOT NULL DEFAULT '',
  type_key TEXT NOT NULL DEFAULT '',
  type_des TEXT NOT NULL DEFAULT '',
  type_logo TEXT NOT NULL DEFAULT '',
  type_pic TEXT NOT NULL DEFAULT '',
  type_union TEXT NOT NULL DEFAULT '',
  type_extend TEXT NOT NULL DEFAULT ''  -- JSON 扩展筛选字段 (年代/地区/语言)
);
CREATE INDEX IF NOT EXISTS idx_type_pid ON type(type_pid);
CREATE INDEX IF NOT EXISTS idx_type_mid ON type(type_mid);
CREATE INDEX IF NOT EXISTS idx_type_sort ON type(type_sort);

-- 2. 视频主表 (Vod - 融合 v8/v10 全字段)
CREATE TABLE IF NOT EXISTS vod (
  vod_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  type_id_1 INTEGER NOT NULL DEFAULT 0,
  vod_name TEXT NOT NULL,
  vod_sub TEXT NOT NULL DEFAULT '',
  vod_en TEXT NOT NULL DEFAULT '',
  vod_status INTEGER NOT NULL DEFAULT 1,
  vod_letter TEXT NOT NULL DEFAULT '',
  vod_color TEXT NOT NULL DEFAULT '',
  vod_tag TEXT NOT NULL DEFAULT '',
  vod_class TEXT NOT NULL DEFAULT '',
  vod_pic TEXT NOT NULL DEFAULT '',
  vod_pic_thumb TEXT NOT NULL DEFAULT '',
  vod_pic_slide TEXT NOT NULL DEFAULT '', -- 横版剧照 (巨幕背景图)
  vod_pic_screenshot TEXT NOT NULL DEFAULT '',
  vod_actor TEXT NOT NULL DEFAULT '',
  vod_director TEXT NOT NULL DEFAULT '',
  vod_writer TEXT NOT NULL DEFAULT '',
  vod_behind TEXT NOT NULL DEFAULT '',
  vod_blurb TEXT NOT NULL DEFAULT '',
  vod_remarks TEXT NOT NULL DEFAULT '',
  vod_pubdate TEXT NOT NULL DEFAULT '',
  vod_total INTEGER NOT NULL DEFAULT 0,
  vod_serial TEXT NOT NULL DEFAULT '',
  vod_tv TEXT NOT NULL DEFAULT '',
  vod_weekday INTEGER NOT NULL DEFAULT 0,
  vod_area TEXT NOT NULL DEFAULT '',
  vod_lang TEXT NOT NULL DEFAULT '',
  vod_year TEXT NOT NULL DEFAULT '',
  vod_version TEXT NOT NULL DEFAULT '',
  vod_state TEXT NOT NULL DEFAULT '',
  vod_duration TEXT NOT NULL DEFAULT '',
  vod_author TEXT NOT NULL DEFAULT '',
  vod_jumpurl TEXT NOT NULL DEFAULT '',
  vod_tpl TEXT NOT NULL DEFAULT '',
  vod_tpl_play TEXT NOT NULL DEFAULT '',
  vod_tpl_down TEXT NOT NULL DEFAULT '',
  vod_isend INTEGER NOT NULL DEFAULT 0,
  vod_lock INTEGER NOT NULL DEFAULT 0, -- 1=锁定，采集不覆盖
  vod_level INTEGER NOT NULL DEFAULT 0, -- 推荐级别 1-9
  vod_copyright INTEGER NOT NULL DEFAULT 0, -- 1=版权拦截
  group_id INTEGER NOT NULL DEFAULT 0, -- 最低会员组
  vod_points INTEGER NOT NULL DEFAULT 0, -- 整片购买积分
  vod_points_play INTEGER NOT NULL DEFAULT 0, -- 单集点播积分
  vod_points_down INTEGER NOT NULL DEFAULT 0, -- 单集下载积分
  vod_trysee INTEGER NOT NULL DEFAULT 0, -- 试看时间(分钟)
  vod_pwd TEXT NOT NULL DEFAULT '',
  vod_pwd_play TEXT NOT NULL DEFAULT '',
  vod_pwd_down TEXT NOT NULL DEFAULT '',
  vod_content TEXT NOT NULL DEFAULT '',
  vod_douban_id INTEGER NOT NULL DEFAULT 0,
  vod_douban_score REAL NOT NULL DEFAULT 0.0,
  vod_score REAL NOT NULL DEFAULT 9.0,
  vod_score_all REAL NOT NULL DEFAULT 0.0,
  vod_score_num INTEGER NOT NULL DEFAULT 1,
  vod_hits INTEGER NOT NULL DEFAULT 0,
  vod_hits_day INTEGER NOT NULL DEFAULT 0,
  vod_hits_week INTEGER NOT NULL DEFAULT 0,
  vod_hits_month INTEGER NOT NULL DEFAULT 0,
  vod_time_hits INTEGER NOT NULL DEFAULT 0,
  vod_up INTEGER NOT NULL DEFAULT 0,
  vod_down INTEGER NOT NULL DEFAULT 0,
  vod_time INTEGER NOT NULL DEFAULT 0,     -- 更新时间戳 (秒)
  vod_time_add INTEGER NOT NULL DEFAULT 0, -- 添加时间戳 (秒)
  vod_time_make INTEGER NOT NULL DEFAULT 0,
  -- 播放组字段 (MacCMS $$$ 与 # 编码格式)
  vod_play_from TEXT NOT NULL DEFAULT '',
  vod_play_server TEXT NOT NULL DEFAULT '',
  vod_play_note TEXT NOT NULL DEFAULT '',
  vod_play_url TEXT NOT NULL DEFAULT '',
  -- 下载组字段
  vod_down_from TEXT NOT NULL DEFAULT '',
  vod_down_server TEXT NOT NULL DEFAULT '',
  vod_down_note TEXT NOT NULL DEFAULT '',
  vod_down_url TEXT NOT NULL DEFAULT '',
  -- v10 分集剧情
  vod_plot INTEGER NOT NULL DEFAULT 0,
  vod_plot_name TEXT NOT NULL DEFAULT '',
  vod_plot_detail TEXT NOT NULL DEFAULT '',
  -- 关系图谱与来源
  vod_rel_vod TEXT NOT NULL DEFAULT '',
  vod_rel_art TEXT NOT NULL DEFAULT '',
  vod_reurl TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vod_type ON vod(type_id);
CREATE INDEX IF NOT EXISTS idx_vod_type_1 ON vod(type_id_1);
CREATE INDEX IF NOT EXISTS idx_vod_name ON vod(vod_name);
CREATE INDEX IF NOT EXISTS idx_vod_time ON vod(vod_time DESC);
CREATE INDEX IF NOT EXISTS idx_vod_hits ON vod(vod_hits DESC);
CREATE INDEX IF NOT EXISTS idx_vod_hits_day ON vod(vod_hits_day DESC);
CREATE INDEX IF NOT EXISTS idx_vod_hits_week ON vod(vod_hits_week DESC);
CREATE INDEX IF NOT EXISTS idx_vod_hits_month ON vod(vod_hits_month DESC);
CREATE INDEX IF NOT EXISTS idx_vod_letter ON vod(vod_letter);
CREATE INDEX IF NOT EXISTS idx_vod_year ON vod(vod_year);
CREATE INDEX IF NOT EXISTS idx_vod_area ON vod(vod_area);
CREATE INDEX IF NOT EXISTS idx_vod_level ON vod(vod_level DESC);
CREATE INDEX IF NOT EXISTS idx_vod_lock ON vod(vod_lock);

-- 3. 采集资源库配置表 (Collect Node)
CREATE TABLE IF NOT EXISTS collect_node (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_type TEXT NOT NULL DEFAULT 'json', -- 'json' 或 'xml'
  filter_from TEXT NOT NULL DEFAULT '',  -- 映射替换播放编码
  filter_word TEXT NOT NULL DEFAULT '',  -- 过滤广告敏感词 (逗号分隔)
  last_run_time INTEGER NOT NULL DEFAULT 0,
  cron_hours INTEGER NOT NULL DEFAULT 24, -- 默认采集最近几小时 (0 为全量)
  status INTEGER NOT NULL DEFAULT 1
);

-- 4. 分类映射绑定表 (Type Bind)
CREATE TABLE IF NOT EXISTS type_bind (
  source_id INTEGER NOT NULL,
  source_type_id INTEGER NOT NULL,
  source_type_name TEXT NOT NULL DEFAULT '',
  local_type_id INTEGER NOT NULL,
  PRIMARY KEY (source_id, source_type_id)
);

-- 5. 播放器配置表 (Player)
CREATE TABLE IF NOT EXISTS player (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,       -- 编码: dplayer, kkm3u8, m3u8, iframe 等
  name TEXT NOT NULL,              -- 显示名称
  player_title TEXT NOT NULL DEFAULT '',
  parse_url TEXT NOT NULL DEFAULT '', -- 主解析接口前缀
  player_parse2 TEXT NOT NULL DEFAULT '', -- 备用第二解析接口前缀
  player_target TEXT NOT NULL DEFAULT '_self', -- _self, iframe, _blank
  player_content TEXT NOT NULL DEFAULT '',
  player_url TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  tip TEXT NOT NULL DEFAULT ''
);

-- 6. 下载器配置表 (Downer)
CREATE TABLE IF NOT EXISTS downer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,       -- thunder, magnet, ed2k, http
  name TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  tip TEXT NOT NULL DEFAULT ''
);

-- 7. 服务器组配置表 (Server)
CREATE TABLE IF NOT EXISTS server (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  tip TEXT NOT NULL DEFAULT ''
);

-- 8. 文章资讯表 (Art - MacCMS 核心第二内容模型)
CREATE TABLE IF NOT EXISTS art (
  art_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  type_id_1 INTEGER NOT NULL DEFAULT 0,
  group_id INTEGER NOT NULL DEFAULT 0,
  art_name TEXT NOT NULL,
  art_sub TEXT NOT NULL DEFAULT '',
  art_en TEXT NOT NULL DEFAULT '',
  art_status INTEGER NOT NULL DEFAULT 1,
  art_letter TEXT NOT NULL DEFAULT '',
  art_color TEXT NOT NULL DEFAULT '',
  art_tag TEXT NOT NULL DEFAULT '',
  art_lock INTEGER NOT NULL DEFAULT 0,
  art_level INTEGER NOT NULL DEFAULT 0,
  art_pic TEXT NOT NULL DEFAULT '',
  art_pic_thumb TEXT NOT NULL DEFAULT '',
  art_pic_slide TEXT NOT NULL DEFAULT '',
  art_author TEXT NOT NULL DEFAULT '官方编辑',
  art_from TEXT NOT NULL DEFAULT '本站原创',
  art_blurb TEXT NOT NULL DEFAULT '',
  art_content TEXT NOT NULL DEFAULT '',
  art_up INTEGER NOT NULL DEFAULT 0,
  art_down INTEGER NOT NULL DEFAULT 0,
  art_hits INTEGER NOT NULL DEFAULT 0,
  art_hits_day INTEGER NOT NULL DEFAULT 0,
  art_hits_week INTEGER NOT NULL DEFAULT 0,
  art_hits_month INTEGER NOT NULL DEFAULT 0,
  art_score REAL NOT NULL DEFAULT 9.0,
  art_score_num INTEGER NOT NULL DEFAULT 1,
  art_time INTEGER NOT NULL DEFAULT 0,
  art_time_add INTEGER NOT NULL DEFAULT 0,
  art_rel_vod TEXT NOT NULL DEFAULT '',
  art_rel_art TEXT NOT NULL DEFAULT '',
  art_pwd TEXT NOT NULL DEFAULT '',
  art_points INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_art_type ON art(type_id);
CREATE INDEX IF NOT EXISTS idx_art_time ON art(art_time DESC);

-- 9. 影视专题表 (Topic - 影视聚合专题)
CREATE TABLE IF NOT EXISTS topic (
  topic_id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_name TEXT NOT NULL,
  topic_sub TEXT NOT NULL DEFAULT '',
  topic_en TEXT NOT NULL DEFAULT '',
  topic_letter TEXT NOT NULL DEFAULT '',
  topic_color TEXT NOT NULL DEFAULT '',
  topic_tpl TEXT NOT NULL DEFAULT '',
  topic_pic TEXT NOT NULL DEFAULT '',
  topic_pic_thumb TEXT NOT NULL DEFAULT '',
  topic_pic_slide TEXT NOT NULL DEFAULT '',
  topic_blurb TEXT NOT NULL DEFAULT '',
  topic_content TEXT NOT NULL DEFAULT '',
  topic_up INTEGER NOT NULL DEFAULT 0,
  topic_down INTEGER NOT NULL DEFAULT 0,
  topic_score REAL NOT NULL DEFAULT 9.0,
  topic_score_num INTEGER NOT NULL DEFAULT 1,
  topic_hits INTEGER NOT NULL DEFAULT 0,
  topic_hits_day INTEGER NOT NULL DEFAULT 0,
  topic_hits_week INTEGER NOT NULL DEFAULT 0,
  topic_hits_month INTEGER NOT NULL DEFAULT 0,
  topic_status INTEGER NOT NULL DEFAULT 1,
  topic_sort INTEGER NOT NULL DEFAULT 0,
  topic_level INTEGER NOT NULL DEFAULT 0,
  topic_rel_vod TEXT NOT NULL DEFAULT '',
  topic_rel_art TEXT NOT NULL DEFAULT '',
  topic_extend TEXT NOT NULL DEFAULT '',
  topic_time INTEGER NOT NULL DEFAULT 0,
  topic_time_add INTEGER NOT NULL DEFAULT 0
);

-- 10. MacCMS v10 漫画模型 (type_mid=12)
CREATE TABLE IF NOT EXISTS manga (
  manga_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  type_id_1 INTEGER NOT NULL DEFAULT 0,
  group_id INTEGER NOT NULL DEFAULT 0,
  manga_name TEXT NOT NULL DEFAULT '',
  manga_sub TEXT NOT NULL DEFAULT '',
  manga_en TEXT NOT NULL DEFAULT '',
  manga_status INTEGER NOT NULL DEFAULT 1,
  manga_letter TEXT NOT NULL DEFAULT '',
  manga_color TEXT NOT NULL DEFAULT '',
  manga_from TEXT NOT NULL DEFAULT '',
  manga_author TEXT NOT NULL DEFAULT '',
  manga_tag TEXT NOT NULL DEFAULT '',
  manga_class TEXT NOT NULL DEFAULT '',
  manga_pic TEXT NOT NULL DEFAULT '',
  manga_pic_thumb TEXT NOT NULL DEFAULT '',
  manga_pic_slide TEXT NOT NULL DEFAULT '',
  manga_pic_screenshot TEXT NOT NULL DEFAULT '',
  manga_blurb TEXT NOT NULL DEFAULT '',
  manga_remarks TEXT NOT NULL DEFAULT '',
  manga_jumpurl TEXT NOT NULL DEFAULT '',
  manga_tpl TEXT NOT NULL DEFAULT '',
  manga_level INTEGER NOT NULL DEFAULT 0,
  manga_lock INTEGER NOT NULL DEFAULT 0,
  manga_points INTEGER NOT NULL DEFAULT 0,
  manga_points_detail INTEGER NOT NULL DEFAULT 0,
  manga_up INTEGER NOT NULL DEFAULT 0,
  manga_down INTEGER NOT NULL DEFAULT 0,
  manga_hits INTEGER NOT NULL DEFAULT 0,
  manga_hits_day INTEGER NOT NULL DEFAULT 0,
  manga_hits_week INTEGER NOT NULL DEFAULT 0,
  manga_hits_month INTEGER NOT NULL DEFAULT 0,
  manga_time INTEGER NOT NULL DEFAULT 0,
  manga_time_add INTEGER NOT NULL DEFAULT 0,
  manga_time_hits INTEGER NOT NULL DEFAULT 0,
  manga_time_make INTEGER NOT NULL DEFAULT 0,
  manga_score REAL NOT NULL DEFAULT 0,
  manga_score_all INTEGER NOT NULL DEFAULT 0,
  manga_score_num INTEGER NOT NULL DEFAULT 0,
  manga_rel_manga TEXT NOT NULL DEFAULT '',
  manga_rel_vod TEXT NOT NULL DEFAULT '',
  manga_pwd TEXT NOT NULL DEFAULT '',
  manga_pwd_url TEXT NOT NULL DEFAULT '',
  manga_content TEXT NOT NULL DEFAULT '',
  manga_serial TEXT NOT NULL DEFAULT '0',
  manga_total INTEGER NOT NULL DEFAULT 0,
  manga_chapter_from TEXT NOT NULL DEFAULT '',
  manga_chapter_url TEXT NOT NULL DEFAULT '',
  manga_last_update_time INTEGER NOT NULL DEFAULT 0,
  manga_age_rating INTEGER NOT NULL DEFAULT 0,
  manga_orientation INTEGER NOT NULL DEFAULT 0,
  manga_is_vip INTEGER NOT NULL DEFAULT 0,
  manga_copyright_info TEXT NOT NULL DEFAULT '',
  manga_recycle_time INTEGER NOT NULL DEFAULT 0,
  manga_check_state INTEGER NOT NULL DEFAULT 0,
  manga_check_reason TEXT NOT NULL DEFAULT '',
  manga_check_time INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_manga_type ON manga(type_id);
CREATE INDEX IF NOT EXISTS idx_manga_visible_time ON manga(manga_status, manga_time DESC);
CREATE INDEX IF NOT EXISTS idx_manga_level ON manga(manga_level DESC);
CREATE INDEX IF NOT EXISTS idx_manga_name ON manga(manga_name);

-- 11. 明星演员表 (Actor - MacCMS v10 核心知识图谱)
CREATE TABLE IF NOT EXISTS actor (
  actor_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  actor_name TEXT NOT NULL,
  actor_en TEXT NOT NULL DEFAULT '',
  actor_letter TEXT NOT NULL DEFAULT '',
  actor_sex TEXT NOT NULL DEFAULT '男',
  actor_color TEXT NOT NULL DEFAULT '',
  actor_status INTEGER NOT NULL DEFAULT 1,
  actor_lock INTEGER NOT NULL DEFAULT 0,
  actor_level INTEGER NOT NULL DEFAULT 0,
  actor_pic TEXT NOT NULL DEFAULT '',
  actor_blurb TEXT NOT NULL DEFAULT '',
  actor_remarks TEXT NOT NULL DEFAULT '',
  actor_area TEXT NOT NULL DEFAULT '',
  actor_height TEXT NOT NULL DEFAULT '',
  actor_weight TEXT NOT NULL DEFAULT '',
  actor_birthday TEXT NOT NULL DEFAULT '',
  actor_birtharea TEXT NOT NULL DEFAULT '',
  actor_blood TEXT NOT NULL DEFAULT '',
  actor_starsign TEXT NOT NULL DEFAULT '',
  actor_school TEXT NOT NULL DEFAULT '',
  actor_works TEXT NOT NULL DEFAULT '',
  actor_content TEXT NOT NULL DEFAULT '',
  actor_hits INTEGER NOT NULL DEFAULT 0,
  actor_up INTEGER NOT NULL DEFAULT 0,
  actor_down INTEGER NOT NULL DEFAULT 0,
  actor_score REAL NOT NULL DEFAULT 9.0,
  actor_time INTEGER NOT NULL DEFAULT 0,
  actor_time_add INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_actor_name ON actor(actor_name);
CREATE INDEX IF NOT EXISTS idx_actor_letter ON actor(actor_letter);

-- 12. 影视角色表 (Role - MacCMS v10 角色模型)
CREATE TABLE IF NOT EXISTS role (
  role_id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL,
  role_en TEXT NOT NULL DEFAULT '',
  role_letter TEXT NOT NULL DEFAULT '',
  role_status INTEGER NOT NULL DEFAULT 1,
  role_lock INTEGER NOT NULL DEFAULT 0,
  role_level INTEGER NOT NULL DEFAULT 0,
  role_pic TEXT NOT NULL DEFAULT '',
  role_actor_name TEXT NOT NULL DEFAULT '',
  role_actor_id INTEGER NOT NULL DEFAULT 0,
  role_vod_name TEXT NOT NULL DEFAULT '',
  role_vod_id INTEGER NOT NULL DEFAULT 0,
  role_remarks TEXT NOT NULL DEFAULT '',
  role_content TEXT NOT NULL DEFAULT '',
  role_hits INTEGER NOT NULL DEFAULT 0,
  role_up INTEGER NOT NULL DEFAULT 0,
  role_down INTEGER NOT NULL DEFAULT 0,
  role_score REAL NOT NULL DEFAULT 9.0,
  role_time INTEGER NOT NULL DEFAULT 0,
  role_time_add INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_role_vod ON role(role_vod_id);
CREATE INDEX IF NOT EXISTS idx_role_actor ON role(role_actor_id);

-- 13. 网址导航表 (Website)
CREATE TABLE IF NOT EXISTS website (
  website_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  website_name TEXT NOT NULL,
  website_sub TEXT NOT NULL DEFAULT '',
  website_en TEXT NOT NULL DEFAULT '',
  website_letter TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL,
  website_pic TEXT NOT NULL DEFAULT '',
  website_logo TEXT NOT NULL DEFAULT '',
  website_jumpurl TEXT NOT NULL DEFAULT '',
  website_status INTEGER NOT NULL DEFAULT 1,
  website_sort INTEGER NOT NULL DEFAULT 0,
  website_level INTEGER NOT NULL DEFAULT 0,
  website_time INTEGER NOT NULL DEFAULT 0,
  website_referer INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_website_type ON website(type_id);
CREATE INDEX IF NOT EXISTS idx_website_visible_sort ON website(website_status, website_level DESC, website_sort ASC);

-- 14. 会员用户表 (User)
CREATE TABLE IF NOT EXISTS user (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL DEFAULT 1,
  user_name TEXT NOT NULL UNIQUE,
  user_pwd TEXT NOT NULL,
  user_nick TEXT NOT NULL DEFAULT '',
  user_pic TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  user_phone TEXT NOT NULL DEFAULT '',
  user_status INTEGER NOT NULL DEFAULT 1,
  user_points INTEGER NOT NULL DEFAULT 0,
  user_reg_time INTEGER NOT NULL DEFAULT 0,
  user_login_time INTEGER NOT NULL DEFAULT 0,
  user_login_ip TEXT NOT NULL DEFAULT '',
  user_last_login_time INTEGER NOT NULL DEFAULT 0,
  user_last_login_ip TEXT NOT NULL DEFAULT '',
  user_login_num INTEGER NOT NULL DEFAULT 0,
  user_end_time INTEGER NOT NULL DEFAULT 0,
  user_pid INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_name ON user(user_name);

CREATE TABLE IF NOT EXISTS user_invite_code (
  user_id INTEGER PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_invite_reward (
  invite_id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_user_id INTEGER NOT NULL,
  invitee_user_id INTEGER NOT NULL UNIQUE,
  inviter_points INTEGER NOT NULL DEFAULT 0,
  invitee_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invite_reward_inviter ON user_invite_reward(inviter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_play_progress (
  progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vod_id INTEGER NOT NULL,
  play_sid INTEGER NOT NULL DEFAULT 0,
  play_nid INTEGER NOT NULL DEFAULT 0,
  episode_name TEXT NOT NULL DEFAULT '',
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, vod_id, play_sid, play_nid)
);
CREATE INDEX IF NOT EXISTS idx_play_progress_user ON user_play_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_session (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  client_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  revoked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_session_owner ON user_session(user_id, revoked_at, created_at DESC);

-- 15. 会员组与权限策略表 (User Group)
CREATE TABLE IF NOT EXISTS user_group (
  group_id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,
  group_status INTEGER NOT NULL DEFAULT 1,
  group_points_day INTEGER NOT NULL DEFAULT 10,
  group_points_week INTEGER NOT NULL DEFAULT 50,
  group_points_month INTEGER NOT NULL DEFAULT 180,
  group_points_year INTEGER NOT NULL DEFAULT 1800,
  group_points_free INTEGER NOT NULL DEFAULT 0, -- 1=全站免扣点
  group_auth TEXT NOT NULL DEFAULT ''            -- 权限范围 JSON
);

-- 16. 充值卡密表 (Card)
CREATE TABLE IF NOT EXISTS card (
  card_id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_no TEXT NOT NULL UNIQUE,
  card_pwd TEXT NOT NULL,
  card_money REAL NOT NULL DEFAULT 0.0,
  card_points INTEGER NOT NULL DEFAULT 100,
  card_use_status INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL DEFAULT 0,
  card_add_time INTEGER NOT NULL DEFAULT 0,
  card_use_time INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_card_no ON card(card_no);

-- 17. 充值与交易订单表 (Order)
CREATE TABLE IF NOT EXISTS "order" (
  order_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  order_status INTEGER NOT NULL DEFAULT 0,
  order_price REAL NOT NULL DEFAULT 0.0,
  order_time INTEGER NOT NULL DEFAULT 0,
  order_points INTEGER NOT NULL DEFAULT 0,
  order_pay_type TEXT NOT NULL DEFAULT 'manual'
);

-- 18. 会员足迹与消费日志表 (Ulog)
CREATE TABLE IF NOT EXISTS ulog (
  ulog_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ulog_mid INTEGER NOT NULL DEFAULT 1,   -- 1=vod, 2=art, 3=topic
  ulog_type INTEGER NOT NULL DEFAULT 1,  -- 1=浏览历史, 2=收藏夹, 3=点播扣费, 4=下载扣费, 5=积分充值
  ulog_rid INTEGER NOT NULL DEFAULT 0,
  ulog_sid INTEGER NOT NULL DEFAULT 0,
  ulog_nid INTEGER NOT NULL DEFAULT 0,
  ulog_points INTEGER NOT NULL DEFAULT 0,
  ulog_time INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ulog_user ON ulog(user_id, ulog_type, ulog_mid);

CREATE TABLE IF NOT EXISTS vod_access_purchase (
  purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vod_id INTEGER NOT NULL,
  access_type TEXT NOT NULL CHECK(access_type IN ('play','download')),
  episode_id INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, vod_id, access_type, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_vod_access_purchase_user ON vod_access_purchase(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_access_purchase (
  purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('art')),
  content_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, model, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_access_purchase_user ON content_access_purchase(user_id, created_at DESC);

-- 19. 留言与求片报错反馈表 (Gbook)
CREATE TABLE IF NOT EXISTS gbook (
  gbook_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gbook_mid INTEGER NOT NULL DEFAULT 1,
  gbook_rid INTEGER NOT NULL DEFAULT 0,
  gbook_name TEXT NOT NULL DEFAULT '影迷',
  user_id INTEGER NOT NULL DEFAULT 0,
  gbook_status INTEGER NOT NULL DEFAULT 1,
  gbook_ip TEXT NOT NULL DEFAULT '',
  gbook_time INTEGER NOT NULL DEFAULT 0,
  gbook_reply_time INTEGER NOT NULL DEFAULT 0,
  gbook_content TEXT NOT NULL,
  gbook_reply TEXT NOT NULL DEFAULT '',
  vod_name TEXT NOT NULL DEFAULT '',
  play_from TEXT NOT NULL DEFAULT '',
  play_part TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gbook_status ON gbook(gbook_status);

-- 20. 评论与互动表 (Comment)
CREATE TABLE IF NOT EXISTS comment (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_mid INTEGER NOT NULL DEFAULT 1, -- 1=vod, 2=art, 3=topic
  comment_rid INTEGER NOT NULL DEFAULT 0, -- 关联目标 ID (如 vod_id)
  comment_pid INTEGER NOT NULL DEFAULT 0, -- 父评论 ID (楼中楼)
  user_id INTEGER NOT NULL DEFAULT 0,
  comment_name TEXT NOT NULL DEFAULT '热心影迷',
  comment_ip TEXT NOT NULL DEFAULT '',
  comment_content TEXT NOT NULL,
  comment_time INTEGER NOT NULL DEFAULT 0,
  comment_status INTEGER NOT NULL DEFAULT 1,
  comment_up INTEGER NOT NULL DEFAULT 0,
  comment_down INTEGER NOT NULL DEFAULT 0,
  comment_report INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comment_rid ON comment(comment_mid, comment_rid);

-- 21. 友情链接表 (Link)
CREATE TABLE IF NOT EXISTS link (
  link_id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_name TEXT NOT NULL,
  link_url TEXT NOT NULL,
  link_logo TEXT NOT NULL DEFAULT '',
  link_type INTEGER NOT NULL DEFAULT 0,
  link_sort INTEGER NOT NULL DEFAULT 0,
  link_status INTEGER NOT NULL DEFAULT 1
);

-- 22. 广告位管理表 (Ads)
CREATE TABLE IF NOT EXISTS ads (
  ads_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ads_key TEXT NOT NULL UNIQUE,       -- 广告位标识 如 banner, player_pause, footer
  ads_name TEXT NOT NULL,
  ads_content TEXT NOT NULL DEFAULT '',
  ads_status INTEGER NOT NULL DEFAULT 1,
  ads_sort INTEGER NOT NULL DEFAULT 0,
  ads_time INTEGER NOT NULL DEFAULT 0
);

-- 23. 主题配置表 (Theme Config - 移植自海螺影视 Conch_M003 主题后台配置)
CREATE TABLE IF NOT EXISTS theme_config (
  cfg_key TEXT PRIMARY KEY,
  cfg_value TEXT NOT NULL DEFAULT '',
  cfg_group TEXT NOT NULL DEFAULT 'general',
  cfg_title TEXT NOT NULL DEFAULT '',
  cfg_type TEXT NOT NULL DEFAULT 'text'
);
CREATE INDEX IF NOT EXISTS idx_theme_group ON theme_config(cfg_group);

-- 24. 全局键值配置表 (Config)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 25. 采集断点记录表 (Cj History)
CREATE TABLE IF NOT EXISTS cj_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  total_page INTEGER NOT NULL DEFAULT 1,
  total_records INTEGER NOT NULL DEFAULT 0,
  last_time INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0
);

-- 26. MacCMS10 直播分类与频道 (Cloudflare D1 实现)
CREATE TABLE IF NOT EXISTS live_category (
  live_category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_category_name TEXT NOT NULL,
  live_category_sort INTEGER NOT NULL DEFAULT 0,
  live_category_status INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_live_category_status_sort
  ON live_category(live_category_status, live_category_sort, live_category_id);
CREATE TABLE IF NOT EXISTS live_channel (
  live_id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_category_id INTEGER NOT NULL DEFAULT 0,
  live_name TEXT NOT NULL,
  live_url TEXT NOT NULL,
  live_logo TEXT NOT NULL DEFAULT '',
  live_desc TEXT NOT NULL DEFAULT '',
  live_status INTEGER NOT NULL DEFAULT 1,
  live_sort INTEGER NOT NULL DEFAULT 0,
  live_time INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_channel_status_sort
  ON live_channel(live_status, live_sort, live_id);
CREATE INDEX IF NOT EXISTS idx_live_channel_category
  ON live_channel(live_category_id, live_status, live_sort);

-- 27. 后台操作审计、内容访问统计与 URL 推送历史
CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_name TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '', response_status INTEGER NOT NULL DEFAULT 0,
  client_ip TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS traffic_event (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL, content_id INTEGER NOT NULL DEFAULT 0,
  visitor_hash TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_traffic_day_model ON traffic_event(day, model);
CREATE INDEX IF NOT EXISTS idx_traffic_content ON traffic_event(model, content_id, created_at DESC);
CREATE TABLE IF NOT EXISTS url_push_log (
  push_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL DEFAULT '', submitted INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 0, remain INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0, response TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_url_push_created ON url_push_log(created_at DESC);
CREATE TABLE IF NOT EXISTS collect_run_log (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL DEFAULT 0, node_name TEXT NOT NULL DEFAULT '',
  hours INTEGER NOT NULL DEFAULT 24, page INTEGER NOT NULL DEFAULT 1,
  fetched INTEGER NOT NULL DEFAULT 0, inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1, message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_collect_run_created ON collect_run_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collect_run_node ON collect_run_log(node_id, created_at DESC);
CREATE TABLE IF NOT EXISTS user_login_log (
  login_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0, user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'login', client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_login_created ON user_login_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_user ON user_login_log(user_id, created_at DESC);

-- ========================================================
-- 预设默认数据 (分类、播放器、会员组、广告位、配置等)
-- ========================================================

-- 预设分类体系 (MacCMS 经典一级与二级分类)
INSERT OR IGNORE INTO type (type_id, type_name, type_en, type_sort, type_mid, type_pid) VALUES
(1, '电影', 'dianying', 1, 1, 0),
(2, '连续剧', 'lianxuju', 2, 1, 0),
(3, '综艺', 'zongyi', 3, 1, 0),
(4, '动漫', 'dongman', 4, 1, 0),
(5, '纪录片', 'jilupian', 5, 1, 0),
(6, '动作片', 'dongzuopian', 1, 1, 1),
(7, '喜剧片', 'xijupian', 2, 1, 1),
(8, '爱情片', 'aiqingpian', 3, 1, 1),
(9, '科幻片', 'kehuanpian', 4, 1, 1),
(10, '恐怖片', 'kongbupian', 5, 1, 1),
(11, '剧情片', 'juqingpian', 6, 1, 1),
(12, '战争片', 'zhanzhengpian', 7, 1, 1),
(13, '国产剧', 'guochanju', 1, 1, 2),
(14, '港台剧', 'gangtaiju', 2, 1, 2),
(15, '日韩剧', 'rihanju', 3, 1, 2),
(16, '欧美剧', 'oumeiju', 4, 1, 2),
(17, '影视资讯', 'zixun', 1, 2, 0),
(18, '华语明星', 'huayu', 1, 8, 0),
(19, '欧美明星', 'oumei', 2, 8, 0);

-- 预设播放器
INSERT OR IGNORE INTO player (id, code, name, player_title, parse_url, player_parse2, status, sort, tip) VALUES
(1, 'dplayer', 'DPlayer-H5播放器', 'DPlayer内置极速硬解', '', '', 1, 1, '内置开源 DPlayer 播放器，原生支持 HLS / M3U8 / MP4'),
(2, 'm3u8', 'M3U8流媒体', 'M3U8超清直链', '', '', 1, 2, '通用 HLS 直链切片流'),
(3, 'kkm3u8', '快看云播', '快看极速云', '', '', 1, 3, '快看资源站高速播放通道'),
(4, 'iframe', '通用网页Iframe', '外部网页沙箱', '', '', 1, 4, '外链网页沙箱播放器'),
(5, 'parse', 'VIP聚合解析', '智能解析接口', 'https://jx.m3u8.tv/jiexi/?url=', 'https://jx.jsonplayer.com/player/?url=', 1, 5, '第三方通用智能解析接口（支持双解析回退）');

-- 预设会员组
INSERT OR IGNORE INTO user_group (group_id, group_name, group_status, group_points_day, group_points_week, group_points_month, group_points_year, group_points_free) VALUES
(1, '普通注册会员', 1, 10, 50, 180, 1800, 0),
(2, 'VIP黄金会员', 1, 0, 0, 0, 0, 1),
(3, 'VIP钻石年费会员', 1, 0, 0, 0, 0, 1);

-- 预设免签资源站
INSERT OR IGNORE INTO collect_node (id, name, api_url, api_type, filter_from, cron_hours, status) VALUES
(1, '卧龙资源 (JSON)', 'https://wolongzy.cc/inc/apijson_vod.php', 'json', 'dplayer', 24, 1),
(2, '量子资源 (JSON)', 'http://cj.lziapi.com/api.php/provide/vod/', 'json', 'lzm3u8', 24, 1),
(3, '非凡资源 (JSON)', 'http://cj.ffzyapi.com/api.php/provide/vod/', 'json', 'ffm3u8', 24, 1);

-- 预设系统配置
INSERT OR IGNORE INTO config (key, value) VALUES
('site_name', 'MacCMS 苹果影视 (Serverless版)'),
('site_url', 'https://example.com'),
('site_keywords', '苹果CMS,MacCMS,Serverless,Cloudflare,Worker,D1,海螺主题,免费影视'),
('site_description', '基于 Cloudflare Worker + Pages + D1 架构构建的高性能现代影视流媒体系统，全面对齐 MacCMS 10 与 8 规范'),
('admin_user', 'admin'),
('admin_pwd', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'), -- 默认密码: admin888 (SHA-256)
('urlrole', '1'), -- 1=智能合并去重追加集数, 0=完全覆盖
('app_allow_xml', '1'), -- 是否开启兼容 XML RSS 5.1/2.0
('user_status', '1'), -- 是否开启会员注册
('user_reg_points', '50'), -- 注册赠送积分
('user_invite_status', '0'), -- 是否开启邀请奖励
('user_invite_points', '50'), -- 邀请人奖励积分
('user_invited_points', '0'), -- 新会员受邀奖励积分
('timming_key', ''), -- 定时采集访问密钥
('cron_interval_hours', '24');

-- 预设广告位
INSERT OR IGNORE INTO ads (ads_id, ads_key, ads_name, ads_content, ads_status, ads_sort) VALUES
(1, 'home_top', '首页顶部通栏横幅', '<!-- 广告位: home_top 请在此放置广告代码或图片链接 -->', 0, 1),
(2, 'player_pause', '播放器暂停广告', '<!-- 广告位: player_pause -->', 0, 2),
(3, 'detail_banner', '详情页横幅广告', '<!-- 广告位: detail_banner -->', 0, 3),
(4, 'float_right', '全站右下角浮窗广告', '<!-- 广告位: float_right -->', 0, 4);

-- 预设开箱演示影片数据
INSERT OR IGNORE INTO vod (
  vod_id, type_id, type_id_1, vod_name, vod_en, vod_letter, vod_pic, vod_pic_slide, vod_actor, vod_director,
  vod_blurb, vod_remarks, vod_pubdate, vod_area, vod_lang, vod_year, vod_content,
  vod_douban_score, vod_score, vod_hits, vod_hits_day, vod_hits_week, vod_hits_month, vod_isend, vod_time, vod_time_add,
  vod_play_from, vod_play_server, vod_play_note, vod_play_url
) VALUES (
  1, 9, 1, '流浪地球2', 'liulangdiqiu2', 'L',
  'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  '吴京,刘德华,李雪健,沙溢,宁理,王智,朱颜曼滋', '郭帆',
  '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。',
  'HD国语中字', '2023-01-22', '中国大陆', '汉语普通话', '2023',
  '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。',
  8.3, 9.2, 8848, 120, 580, 2400, 1, 1729400000, 1729400000,
  'dplayer$$$m3u8', 'no$$$no', '极速4K$$$备用线路',
  '正片HD$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8#预告片$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8$$$正片$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
), (
  2, 13, 2, '繁花', 'fanhua', 'F',
  'https://image.tmdb.org/t/p/w500/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg',
  'https://image.tmdb.org/t/p/w1280/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
  '胡歌,马伊琍,唐嫣,辛芷蕾,游本昌,郑恺', '王家卫',
  '九十年代的上海处处是机遇与希望，青年阿宝凭借迎难而上的决心在黄河路叱咤风云。',
  '全30集完结', '2023-12-27', '中国大陆', '沪语 / 国语', '2023',
  '九十年代的上海处处是机遇与希望。青年阿宝（胡歌 饰）凭借迎难而上的决心和魄力，在黄河路叱咤风云，有神秘莫测的爷叔相助，有风情万种的至真园老板娘李李、夜东京老板娘玲子、外贸总公司汪小姐各展所长...',
  8.7, 9.5, 12580, 240, 1100, 4800, 1, 1729400500, 1729400500,
  'dplayer', 'no', '高清专线',
  '第01集$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8#第02集$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8#第03集$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
), (
  3, 9, 1, '奥本海默', 'aobenhaimo', 'A',
  'https://image.tmdb.org/t/p/w500/rLb2cwF3Pazuxaj0sRXQ037tGI1.jpg',
  'https://image.tmdb.org/t/p/w1280/rLb2cwF3Pazuxaj0sRXQ037tGI1.jpg',
  '基里安·墨菲,艾米莉·布朗特,马特·达蒙,小罗伯特·唐尼', '克里斯托弗·诺兰',
  '聚焦“原子弹之父”罗伯特·奥本海默主导制造第一颗原子弹的传奇历程。',
  'HD原声中字', '2023-08-30', '美国', '英语', '2023',
  '讲述了美国“原子弹之父”罗伯特·奥本海默在“二战期间”领导曼哈顿计划，研制出世界上第一颗原子弹的过程，以及战后他在听证会上遭受政治迫害的复杂人生。',
  8.8, 9.3, 19820, 310, 1500, 6200, 1, 1729401000, 1729401000,
  'dplayer$$$kkm3u8', 'no$$$no', 'IMAX原画$$$备用线路',
  'HD中英双字$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8$$$HD国语$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
), (
  4, 4, 4, '间谍过家家 代号：白', 'jiandieguojiajia', 'J',
  'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w1280/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  '江口拓也,种崎敦美,早见沙织,松田健一郎', '片桐崇',
  '出色的间谍“黄昏”化身为心理医生劳埃德·福杰，与拥有读心术的超能力女孩阿尼亚展开全新冒险。',
  '超清中字', '2024-04-30', '日本', '日语', '2024',
  '这是个世界各国都在暗地里进行激烈情报战的时代。西国情报局对东课的得力间谍“黄昏”接受了秘密任务：调查东国国家统一党党魁德斯蒙。为了接近目标，他必须在一周内组建家庭...',
  7.8, 8.9, 7520, 90, 480, 2100, 1, 1729401500, 1729401500,
  'dplayer', 'no', '极速播放',
  '正片$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
), (
  5, 6, 1, '沙丘2', 'shaqiu2', 'S',
  'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  'https://image.tmdb.org/t/p/w1280/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg',
  '提莫西·查拉梅,赞达亚,丽贝卡·弗格森,弗洛伦丝·皮尤', '丹尼斯·维伦纽瓦',
  '保罗·厄崔迪携手契妮与弗雷曼人，向毁灭他家族的阴谋者展开复仇。',
  '4K高码率', '2024-03-08', '美国', '英语', '2024',
  '《沙丘2》承接第一部剧情，讲述保罗·厄崔迪被皇帝和哈克南人联手灭族后，在厄拉科斯星球与弗雷曼人契妮相遇相爱，并融入弗雷曼部落，成为厄崔迪家族最后希望的传奇故事。',
  8.3, 9.1, 16300, 280, 1340, 5600, 1, 1729402000, 1729402000,
  'dplayer', 'no', '4K专线',
  '正片4K$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
);

-- 预设文章资讯 (Art)
INSERT OR IGNORE INTO art (
  art_id, type_id, type_id_1, art_name, art_sub, art_en, art_author, art_from,
  art_blurb, art_content, art_hits, art_time, art_time_add, art_rel_vod
) VALUES (
  1, 17, 0, '《流浪地球2》硬核科幻世界观全景深度剖析', '从太空电梯到数字生命', 'liulangdiqiu2-fenxi',
  '资深影评人', '影评周刊',
  '深度解析《流浪地球2》中涉及的行星发动机、太空电梯、数字生命卡等5大关键科幻硬核设定。',
  '<p>《流浪地球2》不仅是视觉上的饕餮盛宴，更是中国硬科幻电影里程碑式的作品。影片开篇的太空电梯危机就给观众带来了极致的工业美感与压迫感。数字生命计划与流浪地球计划的哲学博弈，贯穿整部电影的始终...</p>',
  5420, 1729400000, 1729400000, '1'
), (
  2, 17, 0, '《繁花》的王家卫光影美学：九十年代上海滩的时代挽歌', '繁花似锦下的江湖情仇', 'fanhua-meixue',
  '光影记', '影视艺术探索',
  '王家卫首部剧集作品《繁花》镜头语言与抽帧技术、色彩调色的极致运用探析。',
  '<p>王家卫用电影级的单机拍摄手法构建了独特的电视剧质感。黄河路的霓虹闪烁、至真园的暗香涌动、夜东京的市井烟火，每一帧画面都凝聚着时代变迁的唏嘘与浪漫...</p>',
  8390, 1729400500, 1729400500, '2'
);

-- 预设影视专题 (Topic)
INSERT OR IGNORE INTO topic (
  topic_id, topic_name, topic_en, topic_pic, topic_blurb, topic_content, topic_hits, topic_rel_vod, topic_time
) VALUES (
  1, '硬核科幻与太空史诗大片盘点', 'kehuandapan',
  'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  '领略跨越星际与维度的恢弘太空史诗，探索人类未来的终极命运。',
  '<p>精选近十年全球现象级硬核科幻力作，带你穿梭于星际虫洞与行星发动机轰鸣的末世图景中。</p>',
  12800, '1,3,5', 1729400000
), (
  2, '豆瓣9分+华语殿堂级光影佳作', 'huayujiazuo',
  'https://image.tmdb.org/t/p/w500/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg',
  '不可错过的华语影视巅峰之作，岁月沉淀的时代荧幕记忆。',
  '<p>收录评分与口碑双封神的华语精品大剧与电影，感受极致的叙事与光影艺术。</p>',
  18600, '1,2', 1729400500
);

-- 预设明星 (Actor)
INSERT OR IGNORE INTO actor (
  actor_id, type_id, actor_name, actor_en, actor_letter, actor_sex, actor_pic,
  actor_area, actor_birthday, actor_works, actor_blurb, actor_content, actor_hits, actor_time
) VALUES (
  1, 18, '吴京', 'wujing', 'W', '男',
  'https://image.tmdb.org/t/p/w300/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  '中国北京', '1974-04-03', '流浪地球,战狼,长津湖',
  '中国内地男演员、导演、编剧，全国政协委员。',
  '<p>吴京，1974年4月3日出生于北京，毕业于北京体育大学。中国内地男演员、电影导演、编剧。代表作《流浪地球》、《战狼2》等创下中国电影多项历史票房纪录。</p>',
  35200, 1729400000
), (
  2, 18, '胡歌', 'huge', 'H', '男',
  'https://image.tmdb.org/t/p/w300/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg',
  '中国上海', '1982-09-20', '繁花,琅琊榜,伪装者,仙剑奇侠传',
  '中国内地男演员、流行乐歌手，代表作《繁花》《琅琊榜》。',
  '<p>胡歌，1982年9月20日出生于上海市徐汇区，毕业于上海戏剧学院表演系。凭借电视剧《仙剑奇侠传》成名，主演电视剧《琅琊榜》《繁花》多次斩获白玉兰最佳男主角奖。</p>',
  42100, 1729400000
);

-- 预设角色 (Role)
INSERT OR IGNORE INTO role (
  role_id, role_name, role_en, role_letter, role_actor_name, role_actor_id,
  role_vod_name, role_vod_id, role_remarks, role_content, role_time
) VALUES (
  1, '刘培强', 'liu peiqiang', 'L', '吴京', 1, '流浪地球2', 1,
  '中国航天员，领航员号空间站特战队员',
  '<p>刘培强，电影《流浪地球》系列的核心角色，为全人类的存亡与家人的未来甘愿奉献一切的伟大军人与父亲。</p>',
  1729400000
), (
  2, '阿宝 (宝总)', 'bao zong', 'A', '胡歌', 2, '繁花', 2,
  '黄河路传奇风云商人',
  '<p>阿宝，人称宝总，在爷叔的指点与协助下，抓住改革开放浪潮一跃成为商界翘楚，重情重义，深谋远虑。</p>',
  1729400000
);

-- 预设评论数据 (Comment)
INSERT OR IGNORE INTO comment (
  comment_id, comment_mid, comment_rid, comment_name, comment_content, comment_time
) VALUES
(1, 1, 1, '科幻迷老李', '太空电梯那段长镜头看得我热血沸腾，绝对是中国科幻最高水准！', 1729401000),
(2, 1, 1, '星空漫步者', '图恒宇给丫丫完整一生的那段父爱太催泪了，数字生命立意深刻！', 1729401200),
(3, 1, 2, '上海小克勒', '王家卫的画面太精致了，沪语版看简直原汁原味，宝总和爷叔的对手戏绝了！', 1729401300);

-- 预设友情链接 (Link)
INSERT OR IGNORE INTO link (link_id, link_name, link_url, link_sort) VALUES
(1, 'Cloudflare D1 官网', 'https://developers.cloudflare.com/d1/', 1),
(2, 'Hono 极速框架', 'https://hono.dev/', 2),
(3, 'DPlayer 播放器', 'https://dplayer.diygod.dev/', 3);
-- Cloudflare-native parity modules: D1-backed commerce, interaction, moderation,
-- edge scheduling, administrator roles, and optional R2 media metadata.
CREATE TABLE IF NOT EXISTS admin_role (
  role_id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_key TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  role_status INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS admin_account (
  admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'administrator',
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_account_role ON admin_account(role_key, status);
INSERT OR IGNORE INTO admin_role (role_key, role_name, permissions) VALUES
  ('administrator', '超级管理员', '["*"]'),
  ('editor', '内容编辑', '["content","collect"]'),
  ('support', '会员客服', '["users","ops"]');

CREATE TABLE IF NOT EXISTS user_follow (
  follow_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  follow_mid INTEGER NOT NULL DEFAULT 1,
  follow_rid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, follow_mid, follow_rid)
);
CREATE INDEX IF NOT EXISTS idx_follow_user ON user_follow(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS danmaku (
  danmaku_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '访客',
  vod_id INTEGER NOT NULL DEFAULT 0,
  episode_id INTEGER NOT NULL DEFAULT 0,
  position_ms INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#ffffff',
  content TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_danmaku_vod ON danmaku(vod_id, episode_id, status, position_ms);
CREATE TABLE IF NOT EXISTS chatroom_message (
  message_id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_key TEXT NOT NULL DEFAULT 'default',
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '访客',
  content TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chatroom_created ON chatroom_message(room_key, status, created_at DESC);
CREATE TABLE IF NOT EXISTS user_pm (
  pm_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL DEFAULT 0,
  receiver_id INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pm_receiver ON user_pm(receiver_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS share_log (
  share_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'vod',
  content_id INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_created ON share_log(created_at DESC);

CREATE TABLE IF NOT EXISTS cash_log (
  cash_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  cash_type TEXT NOT NULL DEFAULT 'admin_adjustment',
  amount REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cash_user ON cash_log(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS coupon (
  coupon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_code TEXT NOT NULL UNIQUE,
  coupon_name TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  discount_value REAL NOT NULL DEFAULT 0,
  min_spend REAL NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_coupon (
  user_coupon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  redeemed_at INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER NOT NULL DEFAULT 0,
  order_id INTEGER NOT NULL DEFAULT 0,
  UNIQUE(coupon_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupon_user ON user_coupon(user_id, used_at);
CREATE TABLE IF NOT EXISTS mall_goods (
  goods_id INTEGER PRIMARY KEY AUTOINCREMENT,
  goods_name TEXT NOT NULL,
  goods_desc TEXT NOT NULL DEFAULT '',
  goods_pic TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  inventory INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mall_order (
  mall_order_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  goods_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price REAL NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  user_coupon_id INTEGER NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  seckill_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mall_order_status ON mall_order(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_order_user ON mall_order(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_order_coupon ON mall_order(user_coupon_id, status);
CREATE INDEX IF NOT EXISTS idx_mall_order_seckill ON mall_order(seckill_id, status);
CREATE TRIGGER IF NOT EXISTS mall_order_coupon_validate_before_insert
BEFORE INSERT ON mall_order
WHEN NEW.user_coupon_id > 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM user_coupon uc JOIN coupon c ON c.coupon_id = uc.coupon_id
    WHERE uc.user_coupon_id = NEW.user_coupon_id
      AND uc.user_id = NEW.user_id
      AND uc.used_at = 0
      AND uc.order_id = 0
      AND c.status = 1
      AND (c.starts_at = 0 OR c.starts_at <= NEW.created_at)
      AND (c.ends_at = 0 OR c.ends_at >= NEW.created_at)
  ) THEN RAISE(ABORT, '优惠券已使用或正在其他订单中') END;
END;
CREATE TRIGGER IF NOT EXISTS mall_order_coupon_reserve_after_insert
AFTER INSERT ON mall_order
WHEN NEW.user_coupon_id > 0
BEGIN
  UPDATE user_coupon SET order_id = NEW.mall_order_id,
    used_at = CASE WHEN NEW.status = 1 THEN NEW.created_at ELSE used_at END
  WHERE user_coupon_id = NEW.user_coupon_id AND user_id = NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS mall_order_points_ledger_after_insert
AFTER INSERT ON mall_order
WHEN NEW.total_points > 0
BEGIN
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
  VALUES (NEW.user_id,'mall_purchase',0,-NEW.total_points,1,NEW.order_code,'system',NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS mall_order_coupon_paid_after_update
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 1 AND NEW.user_coupon_id > 0
BEGIN
  UPDATE user_coupon SET used_at = NEW.updated_at
  WHERE user_coupon_id = NEW.user_coupon_id AND order_id = NEW.mall_order_id AND used_at = 0;
END;
CREATE TRIGGER IF NOT EXISTS mall_order_cancel_refund_after_update
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 3
BEGIN
  UPDATE mall_goods SET inventory = inventory + NEW.quantity WHERE goods_id = NEW.goods_id;
  UPDATE user SET user_points = user_points + NEW.total_points WHERE user_id = NEW.user_id;
  UPDATE user_coupon SET order_id = 0
  WHERE user_coupon_id = NEW.user_coupon_id AND order_id = NEW.mall_order_id AND used_at = 0;
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
  SELECT NEW.user_id,'mall_refund',0,NEW.total_points,1,NEW.order_code,'system',NEW.updated_at
  WHERE NEW.total_points > 0;
END;
CREATE TABLE IF NOT EXISTS seckill_campaign (
  campaign_id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL,
  goods_id INTEGER NOT NULL,
  sale_price REAL NOT NULL DEFAULT 0,
  inventory INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_seckill_active ON seckill_campaign(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_seckill_goods ON seckill_campaign(goods_id, status);
CREATE TRIGGER IF NOT EXISTS mall_order_seckill_validate_before_insert
BEFORE INSERT ON mall_order
WHEN NEW.seckill_id > 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM seckill_campaign
    WHERE campaign_id = NEW.seckill_id
      AND goods_id = NEW.goods_id
      AND status = 1
      AND (starts_at = 0 OR starts_at <= NEW.created_at)
      AND (ends_at = 0 OR ends_at >= NEW.created_at)
  ) THEN RAISE(ABORT, '秒杀活动未开始、已结束或已停用') END;
END;
CREATE TRIGGER IF NOT EXISTS mall_order_seckill_cancel_restore
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 3 AND NEW.seckill_id > 0
BEGIN
  UPDATE seckill_campaign SET inventory = inventory + NEW.quantity WHERE campaign_id = NEW.seckill_id;
END;
CREATE TABLE IF NOT EXISTS site_notice (
  notice_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  notice_type TEXT NOT NULL DEFAULT 'site',
  status INTEGER NOT NULL DEFAULT 1,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sign_log (
  sign_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sign_day TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, sign_day)
);
CREATE INDEX IF NOT EXISTS idx_sign_day ON sign_log(sign_day, user_id);
CREATE TRIGGER IF NOT EXISTS sign_log_credit_after_insert
AFTER INSERT ON sign_log
BEGIN
  UPDATE user SET user_points = user_points + NEW.points WHERE user_id = NEW.user_id;
  INSERT INTO cash_log (user_id, cash_type, amount, points, status, note, operator, created_at)
    VALUES (NEW.user_id, 'daily_sign', 0, NEW.points, 1, '每日签到奖励', 'system', NEW.created_at);
END;
CREATE TABLE IF NOT EXISTS vod_play_fail (
  fail_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id INTEGER NOT NULL DEFAULT 0,
  vod_name TEXT NOT NULL DEFAULT '',
  play_from TEXT NOT NULL DEFAULT '',
  play_part TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_play_fail_created ON vod_play_fail(status, created_at DESC);
CREATE TABLE IF NOT EXISTS content_check_rule (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'vod',
  field_name TEXT NOT NULL DEFAULT 'name',
  match_text TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_check_issue (
  issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  content_name TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(rule_id, model, content_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_content_issue_status ON content_check_issue(status, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_task (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'collect',
  node_id INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT '',
  last_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_due ON scheduled_task(enabled, next_run_at);
CREATE TABLE IF NOT EXISTS scheduled_task_log (
  task_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL DEFAULT 0,
  task_name TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_log ON scheduled_task_log(created_at DESC);
CREATE TABLE IF NOT EXISTS media_asset (
  media_id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  provider_ref TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  public_url TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_asset(created_at DESC);
CREATE TABLE IF NOT EXISTS media_sync_scan (
  scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL DEFAULT 'running',
  model_index INTEGER NOT NULL DEFAULT 0,
  last_id INTEGER NOT NULL DEFAULT 0,
  scanned_rows INTEGER NOT NULL DEFAULT 0,
  found_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media_sync_item (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  record_name TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(scan_id,model,record_id,field_name,source_url)
);
CREATE INDEX IF NOT EXISTS idx_media_sync_item_queue ON media_sync_item(scan_id,status,item_id);
CREATE INDEX IF NOT EXISTS idx_media_sync_item_target ON media_sync_item(target_url,status);
CREATE TABLE IF NOT EXISTS telegram_storage_account (
  account_id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL DEFAULT '',
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  upload_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(bot_token,chat_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_storage_enabled ON telegram_storage_account(enabled,account_id);
CREATE TABLE IF NOT EXISTS telegram_storage_state (
  state_key TEXT PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO telegram_storage_state (state_key,counter) VALUES ('upload',0);
CREATE TABLE IF NOT EXISTS user_access_rule (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL DEFAULT 'ip',
  rule_value TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(rule_type, rule_value)
);
CREATE INDEX IF NOT EXISTS idx_access_rule_value ON user_access_rule(rule_type, rule_value);
CREATE TABLE IF NOT EXISTS recycle_bin (
  recycle_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  deleted_by TEXT NOT NULL DEFAULT '',
  deleted_at INTEGER NOT NULL DEFAULT 0,
  restored_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recycle_model ON recycle_bin(model, deleted_at DESC);

CREATE TABLE IF NOT EXISTS sign_milestone (
  milestone_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sign_days INTEGER NOT NULL UNIQUE,
  reward_name TEXT NOT NULL DEFAULT '',
  reward_points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_sign_milestone (
  claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  milestone_id INTEGER NOT NULL,
  sign_days INTEGER NOT NULL,
  reward_name TEXT NOT NULL DEFAULT '',
  reward_points INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, milestone_id)
);
CREATE INDEX IF NOT EXISTS idx_user_sign_milestone_user ON user_sign_milestone(user_id, claimed_at DESC);
CREATE TRIGGER IF NOT EXISTS sign_milestone_credit_after_insert
AFTER INSERT ON user_sign_milestone
BEGIN
  UPDATE user SET user_points = user_points + NEW.reward_points WHERE user_id = NEW.user_id;
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
    VALUES (NEW.user_id,'sign_milestone',0,NEW.reward_points,1,NEW.reward_name,'system',NEW.claimed_at);
END;
