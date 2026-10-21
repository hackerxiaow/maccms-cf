# Cloudflare 外部服务配置

以下功能通过后台「系统管理 → 系统设置」配置。更新已有 D1 数据库后，先运行 `npm run d1:migrate`；线上运行 `npm run d1:migrate-remote`。Worker 和 Pages 必须迁移到同一个 D1 实例。

## SMTP 邮箱验证

项目使用 [`worker-mailer`](https://github.com/zou-yu/worker-mailer) 通过 Cloudflare Workers TCP Sockets 连接 SMTP，不需要单独部署邮件 API。`wrangler.toml` 与 `wrangler.pages.toml` 已启用 `nodejs_compat`。

后台填写 SMTP 主机、端口、用户名、密码/授权码、发件人和认证方式。常用配置是 587 + STARTTLS，或 465 + TLS。先保存设置，再填写测试收件邮箱并发送测试邮件。强制邮箱验证后登录前必须完成 SMTP 测试；开启后新注册账号会在验证前被阻止登录。

验证码 10 分钟过期，单码最多尝试 5 次；发送按 IP 和邮箱限频。找回密码成功后会撤销该账号的其他登录会话。`mail_smtp_password` 不会通过后台读取接口返回，留空保存会保留已存密码。

## 在线支付

当前支付接入是托管收银台协议。管理员需要配置收银台 URL、可选的查询 URL、商户 ID、币种、套餐 JSON 和共享签名密钥。支付服务商需要支持以下参数和签名约定；普通支付宝/微信标准接口不能直接填入，需要服务商网关或适配层实现此协议。

创建订单时，本站把以下字段按键名字典序排序，拼成 `key=value&key=value`，再计算 HMAC-SHA256 十六进制签名：

```text
amount_cents, currency, merchant_id, notify_url, order_code, return_url, timestamp, title
```

回调发送 JSON 或表单字段 `order_code`、`amount_cents`、`merchant_id`、`provider_event_id`、`status`、`timestamp`、`sign`。回调签名覆盖除 `sign` 外的前六个业务字段，并使用同样的排序、拼接和 HMAC-SHA256。只有 `status=paid`、订单金额/商户匹配、时间戳在 24 小时内且事件 ID 未被消费时才会入账。支付服务商可把查询接口返回的同格式回调数据用于后台对账。

套餐示例：

```json
[
  {"code":"points-100","name":"100 积分","type":"points","amount_cents":1000,"points":100},
  {"code":"vip-30","name":"VIP 30 天","type":"vip","amount_cents":2900,"vip_days":30}
]
```

## Meilisearch

配置 HTTPS 服务地址与 Search API Key 后，点击「同步 Meilisearch 索引」。项目会建立 `maccms_content` 索引，分批写入视频、文章、专题、明星、角色、网址和漫画；D1 是未配置或搜索服务异常时的回退路径。搜索日志只保存关键词哈希、长度、结果数量和模式，不保存原始搜索词。

## Web Push

在系统设置中填写 VAPID 联系方式并生成密钥。会员需要在 HTTPS 页面中手动授权当前设备推送。后台可发送站内通知并同时推送；失效订阅会自动移除。重新生成 VAPID 密钥后，旧订阅可能需要会员重新授权。

## 钱包和提现

管理员在运营互动的资金流水中使用「调整积分 / 钱包」为会员入账或扣款。会员提交提现后钱包余额立即冻结；审核通过后由管理员线下汇款，再登记「已打款」。驳回申请会自动退回冻结金额。当前提现处理不调用银行或支付渠道 API。

## 资源巡检

系统管理中的资源巡检按内容模型分批检查图片、网址和视频/漫画播放列表中每个字段的第一个 HTTP/HTTPS 地址。它先尝试 HEAD，对不接受 HEAD 的地址再发送单字节 Range 请求；部分资源站会屏蔽这类探测请求，HTTP 403/405 等结果应结合资源站的访问限制人工判断。

## 内容字段翻译

后台「内容翻译」维护视频、文章、专题、明星、角色、漫画和网址的可翻译字段。公开 REST 列表/详情接口可追加 `lang=语言代码`，例如 `/api/vod/list?lang=en-US`；没有填写的译文字段继续返回原文。当前 Provide XML/JSON 接口和现有静态主题页面尚未自动附加语言参数。
