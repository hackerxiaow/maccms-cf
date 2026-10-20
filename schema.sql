-- ========================================================
-- MacCMS Cloudflare D1 (SQLite) 数据库表结构与预设数据
-- 融合 MacCMS v8 核心生态与 MacCMS v10 增强特性
-- ========================================================

-- 1. 分类表 (统一分类模型)
CREATE TABLE IF NOT EXISTS type (
  type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_name TEXT NOT NULL,
  type_en TEXT NOT NULL DEFAULT '',
  type_sort INTEGER NOT NULL DEFAULT 0,
  type_mid INTEGER NOT NULL DEFAULT 1, -- 1=视频, 2=文章, 3=专题
  type_pid INTEGER NOT NULL DEFAULT 0,  -- 0 表示顶级分类
  type_status INTEGER NOT NULL DEFAULT 1,
  type_tpl TEXT NOT NULL DEFAULT '',
  type_extend TEXT NOT NULL DEFAULT ''  -- JSON 扩展筛选字段 (年代/地区/语言)
);
CREATE INDEX IF NOT EXISTS idx_type_pid ON type(type_pid);
CREATE INDEX IF NOT EXISTS idx_type_mid ON type(type_mid);
CREATE INDEX IF NOT EXISTS idx_type_sort ON type(type_sort);

-- 2. 视频主表 (Vod)
CREATE TABLE IF NOT EXISTS vod (
  vod_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  type_id_1 INTEGER NOT NULL DEFAULT 0,
  vod_name TEXT NOT NULL,
  vod_sub TEXT NOT NULL DEFAULT '',
  vod_en TEXT NOT NULL DEFAULT '',
  vod_status INTEGER NOT NULL DEFAULT 1,
  vod_letter TEXT NOT NULL DEFAULT '',
  vod_tag TEXT NOT NULL DEFAULT '',
  vod_class TEXT NOT NULL DEFAULT '',
  vod_pic TEXT NOT NULL DEFAULT '',
  vod_pic_slide TEXT NOT NULL DEFAULT '', -- 横版剧照 (巨幕背景图)
  vod_actor TEXT NOT NULL DEFAULT '',
  vod_director TEXT NOT NULL DEFAULT '',
  vod_writer TEXT NOT NULL DEFAULT '',
  vod_blurb TEXT NOT NULL DEFAULT '',
  vod_remarks TEXT NOT NULL DEFAULT '',
  vod_pubdate TEXT NOT NULL DEFAULT '',
  vod_area TEXT NOT NULL DEFAULT '',
  vod_lang TEXT NOT NULL DEFAULT '',
  vod_year TEXT NOT NULL DEFAULT '',
  vod_content TEXT NOT NULL DEFAULT '',
  vod_douban_id INTEGER NOT NULL DEFAULT 0,
  vod_douban_score REAL NOT NULL DEFAULT 0.0,
  vod_score REAL NOT NULL DEFAULT 9.0,
  vod_score_num INTEGER NOT NULL DEFAULT 1,
  vod_hits INTEGER NOT NULL DEFAULT 0,
  vod_hits_day INTEGER NOT NULL DEFAULT 0,
  vod_hits_week INTEGER NOT NULL DEFAULT 0,
  vod_hits_month INTEGER NOT NULL DEFAULT 0,
  vod_isend INTEGER NOT NULL DEFAULT 0,
  vod_time INTEGER NOT NULL DEFAULT 0,     -- 更新时间戳 (秒)
  vod_time_add INTEGER NOT NULL DEFAULT 0, -- 添加时间戳 (秒)
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
  vod_plot_detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vod_type ON vod(type_id);
CREATE INDEX IF NOT EXISTS idx_vod_type_1 ON vod(type_id_1);
CREATE INDEX IF NOT EXISTS idx_vod_name ON vod(vod_name);
CREATE INDEX IF NOT EXISTS idx_vod_time ON vod(vod_time DESC);
CREATE INDEX IF NOT EXISTS idx_vod_hits ON vod(vod_hits DESC);
CREATE INDEX IF NOT EXISTS idx_vod_letter ON vod(vod_letter);
CREATE INDEX IF NOT EXISTS idx_vod_year ON vod(vod_year);
CREATE INDEX IF NOT EXISTS idx_vod_area ON vod(vod_area);

-- 3. 采集资源库配置表 (Collect Node)
CREATE TABLE IF NOT EXISTS collect_node (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_type TEXT NOT NULL DEFAULT 'json', -- 'json' 或 'xml'
  filter_from TEXT NOT NULL DEFAULT '',  -- 指定播放编码过滤 (如 dplayer)
  last_run_time INTEGER NOT NULL DEFAULT 0,
  cron_hours INTEGER NOT NULL DEFAULT 24, -- 默认采集最近几小时 (如 24)
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
  parse_url TEXT NOT NULL DEFAULT '', -- 解析接口前缀
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  tip TEXT NOT NULL DEFAULT ''
);

-- 6. 文章资讯表 (Art - MacCMS 核心第二内容模型)
CREATE TABLE IF NOT EXISTS art (
  art_id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER NOT NULL DEFAULT 0,
  type_id_1 INTEGER NOT NULL DEFAULT 0,
  art_name TEXT NOT NULL,
  art_sub TEXT NOT NULL DEFAULT '',
  art_en TEXT NOT NULL DEFAULT '',
  art_status INTEGER NOT NULL DEFAULT 1,
  art_letter TEXT NOT NULL DEFAULT '',
  art_tag TEXT NOT NULL DEFAULT '',
  art_pic TEXT NOT NULL DEFAULT '',
  art_author TEXT NOT NULL DEFAULT '官方编辑',
  art_from TEXT NOT NULL DEFAULT '本站原创',
  art_blurb TEXT NOT NULL DEFAULT '',
  art_content TEXT NOT NULL DEFAULT '',
  art_hits INTEGER NOT NULL DEFAULT 0,
  art_time INTEGER NOT NULL DEFAULT 0,
  art_time_add INTEGER NOT NULL DEFAULT 0,
  art_rel_vod TEXT NOT NULL DEFAULT '' -- 关联的视频 ID 列表，如 "1,2"
);
CREATE INDEX IF NOT EXISTS idx_art_type ON art(type_id);
CREATE INDEX IF NOT EXISTS idx_art_time ON art(art_time DESC);

-- 7. 影视专题表 (Topic - 影视聚合专题)
CREATE TABLE IF NOT EXISTS topic (
  topic_id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_name TEXT NOT NULL,
  topic_en TEXT NOT NULL DEFAULT '',
  topic_pic TEXT NOT NULL DEFAULT '',
  topic_blurb TEXT NOT NULL DEFAULT '',
  topic_content TEXT NOT NULL DEFAULT '',
  topic_hits INTEGER NOT NULL DEFAULT 0,
  topic_status INTEGER NOT NULL DEFAULT 1,
  topic_sort INTEGER NOT NULL DEFAULT 0,
  topic_rel_vod TEXT NOT NULL DEFAULT '', -- 逗号分隔关联的视频 ID (如 "1,2")
  topic_time INTEGER NOT NULL DEFAULT 0
);

-- 8. 评论与互动表 (Comment)
CREATE TABLE IF NOT EXISTS comment (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_mid INTEGER NOT NULL DEFAULT 1, -- 1=vod, 2=art, 3=topic
  comment_rid INTEGER NOT NULL DEFAULT 0, -- 关联目标 ID (如 vod_id)
  comment_name TEXT NOT NULL DEFAULT '热心影迷',
  comment_content TEXT NOT NULL,
  comment_time INTEGER NOT NULL DEFAULT 0,
  comment_status INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_comment_rid ON comment(comment_mid, comment_rid);

-- 9. 友情链接表 (Link)
CREATE TABLE IF NOT EXISTS link (
  link_id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_name TEXT NOT NULL,
  link_url TEXT NOT NULL,
  link_sort INTEGER NOT NULL DEFAULT 0,
  link_status INTEGER NOT NULL DEFAULT 1
);

-- 11. 主题配置表 (Theme Config - 移植自海螺影视 Conch_M003 主题后台配置)
CREATE TABLE IF NOT EXISTS theme_config (
  cfg_key TEXT PRIMARY KEY,
  cfg_value TEXT NOT NULL DEFAULT '',
  cfg_group TEXT NOT NULL DEFAULT 'general', -- general/color/style/home/nav/type/detail/play/art/topic
  cfg_title TEXT NOT NULL DEFAULT '',
  cfg_type TEXT NOT NULL DEFAULT 'text'       -- text | color | number | switch | textarea
);
CREATE INDEX IF NOT EXISTS idx_theme_group ON theme_config(cfg_group);

-- 12. 全局键值配置表 (Config)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ========================================================
-- 预设默认数据 (分类、播放器、系统配置、测试影片)
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
(16, '欧美剧', 'oumeiju', 4, 1, 2);

-- 预设播放器
INSERT OR IGNORE INTO player (id, code, name, parse_url, status, sort, tip) VALUES
(1, 'dplayer', 'DPlayer-H5播放器', '', 1, 1, '内置开源 DPlayer 播放器，原生支持 HLS / M3U8 / MP4'),
(2, 'm3u8', 'M3U8流媒体', '', 1, 2, '通用 HLS 直链切片流'),
(3, 'kkm3u8', '快看云播', '', 1, 3, '快看资源站高速播放通道'),
(4, 'iframe', '通用网页Iframe', '', 1, 4, '外链网页沙箱播放器'),
(5, 'parse', 'VIP聚合解析', 'https://jx.m3u8.tv/jiexi/?url=', 1, 5, '第三方通用智能解析接口');

-- 预设常见免签资源站 (供站长快速启用一键采集)
INSERT OR IGNORE INTO collect_node (id, name, api_url, api_type, filter_from, cron_hours, status) VALUES
(1, '卧龙资源 (JSON)', 'https://wolongzy.cc/inc/apijson_vod.php', 'json', 'dplayer', 24, 1),
(2, '量子资源 (JSON)', 'http://cj.lziapi.com/api.php/provide/vod/', 'json', 'lzm3u8', 24, 1),
(3, '非凡资源 (JSON)', 'http://cj.ffzyapi.com/api.php/provide/vod/', 'json', 'ffm3u8', 24, 1);

-- 预设系统配置
INSERT OR IGNORE INTO config (key, value) VALUES
('site_name', 'MacCMS 苹果影视 (Serverless版)'),
('site_url', 'https://example.com'),
('site_keywords', '苹果CMS,MacCMS,Serverless,Cloudflare,Worker,D1,免费影视'),
('site_description', '基于 Cloudflare Worker + Pages + D1 架构构建的高性能现代影视流媒体系统'),
('admin_user', 'admin'),
('admin_pwd', 'aaffebecec560fec66e75f24062224ffa4e07696d2ae9a1fee3707c3f8fd9373'), -- 默认密码: admin888 (SHA-256)
('urlrole', '1'), -- 1=智能合并去重追加集数, 0=完全覆盖
('app_allow_xml', '1'), -- 是否开启兼容 XML RSS 5.1/2.0
('cron_interval_hours', '24');

-- 预设开箱演示影片数据
INSERT OR IGNORE INTO vod (
  vod_id, type_id, type_id_1, vod_name, vod_en, vod_letter, vod_pic, vod_pic_slide, vod_actor, vod_director,
  vod_blurb, vod_remarks, vod_pubdate, vod_area, vod_lang, vod_year, vod_content,
  vod_douban_score, vod_score, vod_hits, vod_isend, vod_time, vod_time_add,
  vod_play_from, vod_play_server, vod_play_note, vod_play_url
) VALUES (
  1, 9, 1, '流浪地球2', 'liulangdiqiu2', 'L',
  'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
  'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  '吴京,刘德华,李雪健,沙溢,宁理,王智,朱颜曼滋', '郭帆',
  '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。',
  'HD国语中字', '2023-01-22', '中国大陆', '汉语普通话', '2023',
  '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。',
  8.3, 9.2, 8848, 1, 1729400000, 1729400000,
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
  8.7, 9.5, 12580, 1, 1729400500, 1729400500,
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
  8.8, 9.3, 19820, 1, 1729401000, 1729401000,
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
  7.8, 8.9, 7520, 1, 1729401500, 1729401500,
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
  8.3, 9.1, 16300, 1, 1729402000, 1729402000,
  'dplayer', 'no', '4K专线',
  '正片4K$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
);

-- 预设文章资讯 (Art)
INSERT OR IGNORE INTO art (
  art_id, type_id, type_id_1, art_name, art_sub, art_en, art_author, art_from,
  art_blurb, art_content, art_hits, art_time, art_time_add, art_rel_vod
) VALUES (
  1, 1, 1, '《流浪地球2》硬核科幻世界观全景深度剖析', '从太空电梯到数字生命', 'liulangdiqiu2-fenxi',
  '资深影评人', '影评周刊',
  '深度解析《流浪地球2》中涉及的行星发动机、太空电梯、数字生命卡等5大关键科幻硬核设定。',
  '<p>《流浪地球2》不仅是视觉上的饕餮盛宴，更是中国硬科幻电影里程碑式的作品。影片开篇的太空电梯危机就给观众带来了极致的工业美感与压迫感。数字生命计划与流浪地球计划的哲学博弈，贯穿整部电影的始终...</p>',
  5420, 1729400000, 1729400000, '1'
), (
  2, 2, 2, '《繁花》的王家卫光影美学：九十年代上海滩的时代挽歌', '繁花似锦下的江湖情仇', 'fanhua-meixue',
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

