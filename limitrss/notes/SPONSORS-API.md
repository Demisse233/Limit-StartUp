# 特别感谢名单

GET https://www.demisse.cn/api/limitrss/sponsors

响应：`{"schemaVersion":1,"updatedAt":"ISO8601","sponsors":[{"name":"昵称","avatar":"https://pic1.afdiancdn.com/..."}]}`。

Cloudflare Pages 的 Production / Preview 分别设置加密 secret：
- AFDIAN_USER_ID
- AFDIAN_API_TOKEN

只配置在服务端，不写入源码。沿用现有 RL KV binding，使用独立的 limitrss:afdian:sponsors:v1 键，不影响登录限流。
名单按最近赞助时间排序，按爱发电用户 ID 去重；公开响应不含 ID、金额、订单、留言、地址。
默认全体赞助者展示头像和昵称；正式上线前在赞助说明中告知公开展示，并提供隐藏申请处理方式。
每小时缓存过期，由下一次请求后台刷新，无请求时不轮询；上游失败保留旧名单，并间隔五分钟重试。
首次尚无快照时同步获取；失败返回 503，不将故障误报为空名单。最多 100 页，超过则保留旧名单并报错，避免发布不完整数据。
当前仅爱发电，不含微信赞赏码付款。尚未实现匿名名单管理或 Webhook。

本地用 .dev.vars 配置 secret（已忽略），运行 wrangler pages dev .；不能在生产静态文件中存放凭据。
生产发布必须先本地验证，再按 AGENTS.md 获得部署授权。新增绑定配置后需部署才能生效。
