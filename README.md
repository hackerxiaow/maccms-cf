# MacCMS Cloudflare Serverless (Worker + Pages + D1)

基于 **TypeScript + Hono + Cloudflare Workers + Pages + D1 (SQLite)** 彻底重构的下一代苹果 CMS。
本项目以轻量、零运维的现代无服务器（Serverless）架构重构了传统 PHP 版 **MacCMS v8**，并深度融合 **MacCMS v10** 的核心现代特性与协议规范。

---

## ✨ 核心特性

1. **边缘云原生架构 (Cloudflare Serverless)**
   - **极速冷启动**：运行于 Cloudflare 全球 Anycast 边缘网络，冷启动低至毫秒级。
   - **零服务器成本**：无须配置 Linux 服务器、PHP-FPM、Nginx 或 MySQL，纯边缘驱动。
   - **原生 D1 数据库**：采用 Cloudflare D1 边缘 SQLite 数据库，读写性能极高并支持本地离线仿真。
2. **MacCMS 核心采集协议兼容**
   - **经典播放列表编解码**：完美兼容 `$$$`（播放源分组）、`#`（分集分隔符）、`$`（单集信息 `集数$URL$独立标识`）规范。
   - **双格式对外输出 (Provide API)**：提供 `/api.php/provide/vod/` 与 `/provide/vod/`，支持 `at=json` 与 `at=xml`（标准 MacCMS RSS 5.1/2.0 XML 格式），任何外部采集站或客户端可无缝对接。
   - **定时采集端点 (Timming API)**：提供 `/api.php/timming/index`，可直接配合 Cloudflare Cron Trigger、外部 Crontab 或云监控调用。
3. **融合 MacCMS v10 增强特性**
   - **统一树形分类模型 (`type_mid`)**：支持视频、文章、专题、明星、角色、网址与漫画 (`type_mid=12`) 分类。
   - **影视知识图谱字段**：全面支持演员、导演、编剧、一句话简介、完结状态与豆瓣评分同步。
   - **智能去重合并算法 (`urlrole=1`)**：采集入库遇到同名剧目时，自动保留本地已有集数并追加远程更新集数，遇到远程新播放源自动平滑并网，绝不丢失本地数据。
   - **独立播放器沙箱解析**：原生支持 DPlayer + HLS.js 极速硬解，并支持为不同播放线路配置外部通用 VIP 智能解析接口（Iframe 沙箱隔离运行）。
   - **毫秒级搜索联想补全**：提供 `/api/vod/suggest` 即时前缀联想接口。
4. **全端响应式界面与单页管理控制台**
   - **终端前台**：采用移植自 **海螺影视 Conch_M003** 主题的 `hl-` 组件体系与视觉设计，覆盖 PC 与移动端。
   - **后台管理系统**：开箱即用的 Web 管理面板（访问 `/admin`），按 MacCMS v10 的顶部主模块、左侧子菜单和多标签工作区组织；覆盖视频、文章、专题、漫画、明星/角色、网址导航、直播频道、会员组、会员、订单、卡密、反馈、评论、广告友链、主题、访问统计、后台操作审计、会员登录/足迹、采集运行记录、百度 URL 推送、D1 JSON 备份还原、多管理员角色权限、R2 媒体库、内容回收站、质检规则、边缘定时任务、签到里程碑/私信/弹幕/聊天室、优惠券、积分商城与限时秒杀、积分流水和会员访问限制。

5. **海螺影视主题 Conch_M003 深度移植**
   - **全站前台页面**：首页 / 影视详情 / 在线播放 / 分类列表（含多维筛选）/ 排行榜 / 专题 / 资讯 / 网址导航 / 搜索，全部按海螺模板的结构与类名体系重建。
   - **双皮肤切换**：内置 `white.css` / `black.css` 深浅两套皮肤，用户可在页脚一键切换并记住选择（`localStorage`）。
   - **95 项主题配置全部后台可视化**：原本写在 `conchvip.php` 的主题参数（主色、副色、图片圆角、首页各区块开关与数量、导航项、筛选维度、详情页背景图、播放器比例、排行榜参数等）已迁入后台「主题全局配置」，保存后前台即时生效、无需重新部署。
   - **零外部依赖图标**：内置 136 个 `hl-icon-*` 图标字体（base64 内联 woff2），不依赖任何 CDN。

### 后台升级与数据库迁移

后台包含 MacCMS v10 风格的主模块导航、移动端抽屉导航、侧栏折叠和多标签工作区。漫画管理使用 `type_mid=12`，支持完整资料编辑、章节地址、多状态筛选和批量操作。

新增 D1 数据表通过 `migrations/` 下的顺序迁移文件维护。开发环境运行 `npm run d1:migrate`；部署数据库更新后运行 `npm run d1:migrate-remote`。漫画、云端运营模块和商城结账分别由后续迁移补齐；Worker 与 Pages 必须对同一个 D1 实例按顺序执行迁移。

后台扩展按 Cloudflare 能力实现：Cron 采集和手动采集共用运行日志；内容访问统计只记录成功的详情页访问，并按日哈希访客 IP；`/sitemap.xml` 生成当前前台真实存在的详情地址。数据库页提供白名单业务表 JSON 导出和分批还原；内容删除先进 D1 回收站；后台角色权限在 API 层校验；R2 图片库需要绑定媒体桶。商城支持领券、下单抵扣、秒杀活动、待核款、管理员确认、履约完成与取消；取消时 D1 触发器会退回商品/活动库存和积分、释放优惠券并记入积分流水。连续签到达到后台配置的里程碑后会自动发放一次奖励。定时任务由固定的 Workers Cron 每 5 分钟检查一次 D1 任务计划。

同一套 Hono Worker 入口也提供 Cloudflare Pages Functions 适配器：`functions/[[path]].ts` 将 Pages 请求交给 Worker，静态文件经 Pages `ASSETS` 绑定返回。Workers 运行方式使用 `wrangler.toml`；Pages 方式使用独立的 `wrangler.pages.toml`，两边共享 `src/` 与 `migrations/`。

---

## 🎨 海螺主题 Conch_M003 移植说明

### 两套模板的差异结论（`Desktop/hai/1` 与 `Desktop/hai/own`）

两者是**同一套主题的两次不同打包**，309 个文件中 294 个（95.4%）字节级完全相同：

| 项目 | `hai/1` | `hai/own/conch` |
|---|---|---|
| 主题标识 | 同 | `Conch_M003 v3.1`（含 `info.ini`） |
| 前台页面模板 | 完全相同 | 完全相同 |
| CSS / 皮肤 | 相同 | 相同 |
| 差异点 | 注入了外部统计脚本 `cdn.r18.top/asset/js/t.js`，并保留了未混淆源码 `js_GHRDLn.tar.gz` | 官方原版 + 品牌替换，**无第三方脚本** |
| 后台配置默认值 | `theme.svideo.id='4'`、`detail.bg.btn='1'`、`theme.img.radius='10'`、首页无专题区块、筛选 5 组 | `theme.svideo.id=''`、无详情背景图、无圆角、首页含专题区块、筛选 4 组 |

本项目采用 **`own/conch`（官方原版）** 作为移植基准：它不含来路不明的第三方脚本，安全性更好。

### 资产落位

```
public/static/theme/
├── css/  style.css  white.css  black.css  swiper.min.css  maccms.css
├── js/   jquery.min.js  swiper.min.js  theme.js  parts/*.js  set/*.js
├── fonts/ iconfont.css  iconfont.woff  iconfont.ttf
└── img/  logo_*.png  favicon.png  load.gif  rating.* 等
```

其中 `maccms.css` 是**补充层**：负责统一栅格（改用 flex + gap 消除模板原生负边距导致的边缘裁切）、修复头像/剧集网格/分页等 Serverless 场景下的布局细节、并把主题色接入 CSS 变量 `--hl-site` / `--hl-subs` / `--hl-radius`。

### 后台主题配置分组（9 组 / 95 项）

| 分组 | 主要配置项 |
|---|---|
| 基础设置 | 站点 LOGO、默认皮肤、图片圆角、自定义 CSS/JS、搜索提示与联想、封面评分与角标 |
| 配色与皮肤 | 主色调 `theme.color.site`、辅助色调 `theme.color.subs` |
| 首页区块 | 焦点图开关与数量、快捷导航、网站公告、热播推荐布局与数量、分类区块 ID 与数量、侧栏排行榜、精彩专题、新闻头条、友情链接 |
| 导航与菜单 | 顶部分类导航、顶部图标组合（`a`=观看记录 `b`=公众号 `d`=最新 `e`=排行 `h`=登录）、扩展入口、底部悬浮按钮 |
| 分类与筛选 | 全局筛选分组（`a,b,c,d,e` 对应分类/类型/地区/年份/语言）、分类页每页数量与排序 |
| 详情页 | 大图背景开关、播放列表/下载列表/简介/相关推荐开关、星级评分面板、侧栏排行榜 |
| 播放页 | 播放器高度比例、提示条、滚动提醒文案、自动连播 |
| 列表与排行 | 排行榜标题、参与分类、每类数量 |
| 资讯与专题 | 资讯列表与侧栏参数、文章版权声明、专题列表与详情开关 |

**配置生效链路**：后台保存 → 写入 D1 `theme_config` 表 → 前台 `GET /api/theme` 返回配置 + 生成的 CSS 变量 → `theme.js` 注入 `<style>` 并按开关渲染各区块。全站主题色、圆角、区块显隐改完刷新即生效。

---

## 📁 目录结构

```text
maccms-cf/
├── schema.sql                 # D1 数据库初始化结构与预设种子数据
├── wrangler.toml              # Cloudflare Workers / D1 / R2 / Cron 配置文件
├── wrangler.pages.toml        # Cloudflare Pages Functions / D1 / R2 配置文件
├── functions/[[path]].ts      # Pages Functions 适配入口
├── package.json               # 项目依赖声明
├── tsconfig.json              # TypeScript 编译配置
├── README.md                  # 本文档
├── migrations/                # D1 顺序迁移（含漫画、后台扩展和云端运营表）
├── src/
│   ├── index.ts               # Worker 主入口 (Hono 路由挂载与 Cron 触发处理)
│   ├── types/
│   │   └── index.ts           # 核心数据实体与接口类型定义
│   ├── utils/
│   │   ├── parser.ts          # 播放列表 $$$ / # / $ 编解码与 v10 智能合并去重引擎
│   │   ├── xml.ts             # MacCMS RSS 5.1/2.0 标准 XML 构建器与反向解析器
│   │   └── auth.ts            # Web Crypto 原生 SHA-256 散列与 Session Token 校验
│   ├── services/
│   │   ├── vod.ts             # 视频与播放数据持久层服务 (D1)
│   │   ├── theme.ts           # 海螺主题全局配置服务 (95 项配置 + CSS 变量生成)
│   │   └── collector.ts       # 资源采集、清洗映射与批量入库服务
│   └── routes/
│       ├── provide.ts         # MacCMS 兼容对外接口 (/api.php/provide/vod/ 与 /art/)
│       ├── api.ts             # 现代 RESTful API (/api/vod, /api/types, /api/theme, /api/vod/filters)
│       ├── admin.ts           # 后台管理 API (增删改查、绑定、主题配置)
│       └── timming.ts         # 定时调度端点 (/api.php/timming/index)
├── public/                    # 静态页面与前端资源
│   ├── index.html             # 首页 (焦点图/热播/分类区块/专题/资讯/友链)
│   ├── detail.html            # 影视详情 (大图背景/多线路/演员/评分/评论)
│   ├── play.html              # 在线播放 (DPlayer+HLS / 选集 / 自动连播)
│   ├── type.html              # 分类列表 (海螺多维筛选器)
│   ├── rank.html              # 排行榜 (总榜/月榜/周榜/评分榜)
│   ├── topic.html             # 专题列表与详情
│   ├── website.html           # 网址目录与分类筛选
│   ├── live.html              # 直播频道分类与播放器
│   ├── art.html               # 资讯列表与详情
│   ├── search.html            # 搜索 (影视 / 资讯)
│   ├── admin/
│   │   └── index.html         # 单页管理后台控制台 (含主题全局配置)
│   └── static/
│       ├── css/style.css      # (旧版样式，保留兼容)
│       ├── js/player.js       # 播放器调度与解析隔离驱动
│       └── theme/             # 海螺 Conch_M003 主题资产
│           ├── css/           # style / white / black / swiper / maccms(补充层)
│           ├── js/            # jquery / swiper / theme.js(运行时) / parts / set
│           ├── fonts/         # iconfont (136 个 hl-icon-* 图标)
│           └── img/           # logo / favicon / 占位图 等
└── test/
    ├── verify.mts             # 协议编解码与核心算法完整单元测试
    ├── migrate-01-slide.sql   # 迁移：vod 表增加横版剧照字段
    ├── migrate-02-theme.sql   # 迁移：新增 theme_config 主题配置表
    ├── extra-vods.sql         # 演示影片补充数据
    ├── rebuild-demo.mjs       # 重建演示数据图片地址
    └── gen-pages.mjs          # 生成排行/专题/资讯/搜索页模板
```

---

## 🚀 快速开始与本地开发

### 1. 安装依赖
```bash
npm install
```

### 2. 初始化本地 D1 数据库
利用 `wrangler` 在本地 SQLite 环境中执行建表与初始数据预设：
```bash
npx wrangler d1 execute maccms-db --local --file=./schema.sql
```
> 若已有旧库需要升级，执行 `npm run d1:migrate`；线上执行 `npm run d1:migrate-remote`。迁移按文件名顺序补齐漫画、直播、日志与推送表。

Pages 本地开发可运行 `npm run pages:dev`。Pages 部署前把 `wrangler.pages.toml` 中的 `database_id` 换成真实 D1 ID，并创建 R2 桶 `maccms-media`；再执行 `npm run d1:pages:migrate` 和 `npm run pages:deploy`。Worker 部署使用 `npm run d1:migrate-remote` 与 `npm run deploy`。两个配置文件分别维护资源绑定，数据库 ID 和站点变量需要保持一致。

### 3. 运行本地开发服务
```bash
npm run dev
# 或 npx wrangler dev
```
启动后终端将输出本地访问地址（如 `http://localhost:8787`）：
- **前台首页**：`http://localhost:8787/`
- **分类列表（含多维筛选）**：`http://localhost:8787/type.html?id=1`
- **影视详情**：`http://localhost:8787/detail.html?id=1`
- **在线播放**：`http://localhost:8787/play.html?id=1&sid=0&nid=0`
- **排行榜**：`http://localhost:8787/rank.html`
- **专题 / 资讯 / 搜索**：`/topic.html`、`/art.html`、`/search.html?wd=关键词`
- **后台管理**：`http://localhost:8787/admin/index.html`（初始账号：`admin`，密码：`admin888`）
- **主题全局配置**：后台左侧菜单「🎨 主题全局配置」
- **对外采集接口**：`http://localhost:8787/api.php/provide/vod/?ac=list`

### 4. 运行单元与协议测试
```bash
node --experimental-strip-types test/verify.mts
```

---

## ☁️ 部署至 Cloudflare 线上

### 步骤一：创建生产 D1 数据库
```bash
npx wrangler d1 create maccms-db
```
执行后终端会返回类似如下的信息：
```text
[[d1_databases]]
binding = "DB"
database_name = "maccms-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
将上述 `database_id` 填入 `wrangler.toml` 中的 `database_id` 对应位置。

### 步骤二：初始化远程线上数据库
```bash
npx wrangler d1 execute maccms-db --remote --file=./schema.sql
```

### 步骤三：一键发布上线
```bash
npm run deploy
# 或 npx wrangler deploy
```
Wrangler 会自动打包 TypeScript 代码及 `public/` 下的静态资源，并在全球边缘节点生效。

---

## 📖 核心功能与后台使用指南

### 1. 登录后台
- 访问：`https://你的域名/admin/index.html`
- 初始账号：`admin`
- 初始密码：`admin888`（登录后可在「系统设置」中修改密码或通过环境变量 `ADMIN_PASSWORD` 覆盖）。

### 2. 资源站一键采集与分类映射
1. 进入后台「**采集中心**」，预置了常用开放资源库（如卧龙、量子、非凡等）。
2. 点击采集源右侧的「**绑定分类**」，系统会自动请求上游接口拉取其分类字典，站长只需选择对应的本地分类（如将上游「动作片」映射为本地「动作片」）。
3. 点击「**即时采集**」或「**采集全站今日更新**」，系统将拉取近 24 小时资源并采用 `urlrole=1` 智能追加合并入库。

### 3. 自动化定时采集配置
- **方式一（Cloudflare Cron 原生定时触发）**：
  在 `wrangler.toml` 中已开启 `[triggers] crons = ["*/5 * * * *"]`；部署后 Worker 每 5 分钟检查 D1 任务计划，并按采集节点间隔运行到期任务。
- **方式二（外部计划任务）**：
  使用宝塔、Linux crontab、GitHub Actions 或外部云监控定时请求：
  ```bash
  curl -s "https://你的域名/api.php/timming/index?h=24"
  ```

### 4. 播放器与第三方解析接口配置
- 进入后台「**播放器配置**」，支持管理各播放编码（如 `dplayer`, `m3u8`, `kkm3u8`, `iframe` 等）。
- 当播放源需要外部解析时，直接在「解析接口前缀」填入你的接口地址（如 `https://jx.example.com/?url=`），前端播放器将自动调度沙箱 Iframe 进行解析播放。

### 5. 前台主题全局配置（海螺 Conch_M003）
进入后台左侧「**🎨 主题全局配置**」，按 9 个分组调整前台表现，保存后刷新前台立即生效：

- **配色与皮肤**：主色调 / 辅助色调（全站按钮、选中态、评分、标签、渐变均跟随）；默认皮肤选浅色或深色；图片圆角像素值。
- **首页区块**：可分别开关焦点图、快捷导航、网站公告、热播推荐、分类影视区块、精彩专题、新闻头条、友情链接，并调整各区块数量、参与分类 ID、侧栏排行榜排序。
- **导航与菜单**：`nav.type.PC` 控制顶部分类导航显示哪些分类；`nav.top.PC` 用字母组合控制顶部图标（`a`=观看记录 `b`=公众号 `c`=专题 `d`=最新 `e`=排行 `f`=自定义 `h`=登录）；底部悬浮按钮同理。
- **分类与筛选**：`show.filter` 用字母组合控制分类页筛选维度（`a`=分类 `b`=类型 `c`=地区 `d`=年份 `e`=语言）。
- **详情页 / 播放页 / 列表与排行 / 资讯与专题**：分别控制各页面的模块显隐、标题文案、数量与排序。

> 每个字段下方灰色小字即其配置键（如 `theme.color.site`），与海螺原主题 `conchvip.php` 的参数一一对应，便于对照迁移。
> 若想恢复默认，点击分组上方的「↺ 重置本组」即可。

---

## 📡 API 接口参考手册

| 接口端点 | 请求方式 | 说明 |
| :--- | :--- | :--- |
| `/api.php/provide/vod/?ac=list` | GET | 标准 MacCMS 资源站分类与概要列表接口 (支持 `&at=xml` 输出标准 RSS 5.1 XML) |
| `/api.php/provide/vod/?ac=videolist&h=24` | GET | 今日更新影视详情列表 (含播放源与全量集数) |
| `/api.php/provide/art/?ac=list` | GET | 文章资讯对外提供接口 |
| `/api.php/timming/index` | GET | 定时采集调度入口 (支持 `h=24` 时间跨度) |
| `/api/user/sign` | POST | 会员每日签到积分与连续签到里程碑奖励 |
| `/api/user/follows/toggle` | POST | 关注或取消关注内容 |
| `/api/danmaku/list`、`/api/danmaku/add` | GET / POST | 弹幕读取与审核提交 |
| `/api/chatroom/messages`、`/api/chatroom/send` | GET / POST | 聊天室消息读取与发送 |
| `/api/user/messages` | GET / POST | 会员站内私信 |
| `/api/user/coupons/redeem` | POST | 兑换优惠券 |
| `/api/mall/goods`、`/api/mall/orders` | GET / POST | 积分商品和商城订单；创建订单可传 `user_coupon_id` 抵扣现金部分 |
| `/api/mall/seckill` | GET | 当前生效且有库存的秒杀活动 |
| `/api/mall/orders/:id/cancel` | POST | 取消本人待核款订单，自动回退积分、库存与优惠券 |
| `/api/vod/play-fail` | POST | 播放报错反馈 |

### Cloudflare 运行边界

Workers/Pages 运行环境没有 PHP-FPM、MySQL 文件、可写的 Pages 模板目录或主机操作系统，因此不提供 PHP 插件安装/执行、模板文件在线编辑、MySQL 任意 SQL 控制台、本机文件备份、CPU/磁盘监控，也不能在后台直接改写已部署的静态模板文件。D1 JSON 备份、主题参数、R2 媒体存储、Worker 健康检查和受控 SQL 数据迁移是对应的云端方案。商城订单支持积分扣款和线下收款核验；银行卡/第三方支付、邮件短信、AI 生成和搜索服务需要另配供应商与密钥。
| `/api/vod/list` | GET | 影视分页列表（参数：`page` `limit` `type_id` `by` `wd` `letter` `year` `area` `vod_class` `vod_lang` `state`） |
| `/api/vod/detail/:id` | GET | 影视详情（返回已解析的 `play_groups` 多线路选集） |
| `/api/vod/banners` | GET | 首页焦点图推荐（按播放量） |
| `/api/live/categories` | GET | 直播分类 |
| `/api/live/list` | GET | 已启用直播频道分页列表（支持 `page` `limit` `category_id`） |
| `/sitemap.xml` | GET | 按当前前台真实详情页地址生成 XML Sitemap |

后台新增的 MacCMS10 运维能力位于「直播管理」「运营互动」「系统管理」「会员中心」和「采集配置」：直播分类/频道维护、百度主动 URL 推送、访问统计、管理员写操作审计、会员登录记录与足迹、每日签到与连续签到奖励、定时/手动采集日志、D1 业务表 JSON 备份还原。更新已有数据库时执行 `npm run d1:migrate`（线上执行 `npm run d1:migrate-remote`）。
| `/api/vod/rankings` | GET | 今日热播 / 每周热播 / 口碑高分三组榜单 |
| `/api/vod/filters/:typeId` | GET | 分类页多维筛选字典（年份、地区、语言、类型、状态、字母） |
| `/api/vod/suggest?wd=片名` | GET | 搜索框联想词毫秒级实时补全 |
| `/api/types` | GET | 全站父子分类树 |
| `/api/art/list` · `/api/art/detail/:id` | GET | 文章资讯列表与详情 |
| `/api/topic/list` · `/api/topic/detail/:id` | GET | 影视专题列表与详情 |
| `/api/website/list` · `/api/website/detail/:id` · `/api/website/go/:id` | GET | 网址导航列表、详情与计数跳转 |
| `/api.php/provide/website/?ac=list` | GET | MacCMS 兼容网址导航 JSON 接口（支持 `&at=xml`） |
| `/api/admin/order/list` | GET | 后台订单分页、状态筛选和订单号/会员搜索 |
| `/api/comment/list` · `/api/comment/add` | GET / POST | 影评读取与发表 |
| `/api/links` | GET | 友情链接 |
| `/api/players` | GET | 启用中的播放器编码及其解析接口列表 |
| `/api/theme` | GET | **主题配置 + 运行时 CSS 变量**（前台启动时拉取，`Cache-Control: 30s`） |
| `/api/admin/theme` | GET | 后台读取全部主题配置项（含分组元信息） |
| `/api/admin/theme/save` | POST | 批量保存主题配置（仅允许写入已登记配置键） |
| `/api/admin/theme/reset` | POST | 重置某分组或全部主题配置为默认值 |
