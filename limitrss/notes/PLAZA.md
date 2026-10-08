# LimitRSS Plaza 运维与接口

## 结构

- `/limitrss/plaza/` 中英文共享广场；首页导航提供入口。
- `functions/api/limitrss/plaza/`：匿名上传、公开列表、公开详情。
- D1：`plaza_feeds`（地址去重）及 `plaza_limits`（按 IP 哈希限流）；与现有 DB 绑定共用数据库，但不修改原表。
- `workers/plaza-checker/`：独立 Cron Worker，定时读取待检查来源。Pages Functions 本身不支持定时触发。

## 检测策略

每 5 分钟运行一轮，最多检测 5 个来源，顺序执行，每个最大 12 秒、1 MiB、最多 4 次请求（包含重定向）。成功后目标 12 小时再检测；失败按 1、2、3…12 小时退避；连续 3 次失败标记连续失败，恢复成功立即归零。首次检测成功之前不公开。已公开来源失败仍保留检测结果。

当前容量约 1440 次检测/天；大量来源会排队，12 小时是目标间隔而非所有规模下的保证。先监控排队长度，扩大规模时拆分批次或使用 Queue，不应直接无限提高每轮数量。

只接受 HTTP(S) 和 rsshub:// 公共路线；拒绝内网/IP 字面量、URL 用户密码、明显凭据查询参数、非默认端口。检查 DNS A 记录和每次重定向，拒绝解析到保留/内网地址；v1 不接受只有 IPv6 地址的站点。RSSHub 保留原始 rsshub:// 路线，通过地址校验后直接公开，带 RSSHub 标志，状态固定为 unknown，不进行网络可用性检测。现有记录通过迁移和定时任务清除旧实例检测结果。XML 拒绝 HTML、无标题来源、DTD/实体声明及无效 XML。分类根据标题/描述规则，不使用 AI 服务。

公网地址校验不保证任意链接不含个人凭据；客户端必须展示地址并提示不要分享私密链接。诊断日志不写原始 URL、IP、用户信息。服务器日志是结构化计数、状态、原因和耗时；客户端使用诊断中心 plaza 模块。

## 部署（必须先取得用户授权）

本地测试：

```sh
npm ci
npm run test:plaza
npx wrangler d1 execute limit-startup-db --local --file workers/plaza-checker/schema.sql
npx wrangler pages dev . --port 8788
npx wrangler deploy --dry-run --config workers/plaza-checker/wrangler.toml
```

用户确认后依次：

```sh
npx wrangler d1 execute limit-startup-db --remote --file workers/plaza-checker/schema.sql
npx wrangler deploy --config workers/plaza-checker/wrangler.toml
bash scripts/deploy.sh
```

沿用 DB 绑定，无客户端密钥，不需要新增 Secret。Worker 启用 observability，检查 Cron、D1 查询失败和队列积压。网站接口公开只读，不会暴露现有网站账号资料。

## 维护

客户端约定见客户端仓库 `docs/LIMITRSS_PLAZA.md`。首次发布检查空列表、上传、重复地址、等待 Cron 发布、搜索过滤、网页唤起已更新客户端。

异常来源可在 Cloudflare D1 控制台先查询来源 ID，再手动下架：

```sql
UPDATE plaza_feeds SET published=0,next_check=9007199254740991 WHERE id='<核对后的来源ID>';
```

此操作保留记录，便于恢复；恢复设 `next_check=0` 后通过检测才重新公开。此阶段不含用户账号、评论、AI 分类和独立审核后台。匿名上传的滥用先通过限流、检测和人工下架处理。

## 语言与热度

目录与详情返回 `language`、`copyCount`、`importCount`、`popularity`、`createdAt`。语言来自 RSS `<language>` 或 Atom `xml:lang`，未声明时为 null，网页显示“未标注”。检测成功时刷新语言，检测失败保留上一次结果。已有来源在下次成功检测后获得语言。

`POST /api/limitrss/plaza/:id/interaction`，JSON 为 `{"action":"copy"}` 或 `{"action":"import"}`。仅公开来源可计数，服务端原子累加，返回最新计数，响应不缓存。每 IP 哈希每分钟最多 60 次、每天最多 500 次。热度 = 成功复制次数 + 导入点击次数（不代表客户端最终导入成功，也不是独立用户数）。重复点击在限流范围内仍计数；不采集用户身份。默认全目录按热度降序、添加时间降序、ID 升序稳定排序，再分页。网页更新数字时不重排当前行，重新加载目录后采用最新排序。列表缓存最长 60 秒。

部署此改动前先运行数据库迁移，且同步部署检测 Worker：

```sh
npx wrangler d1 execute limit-startup-db --remote --file migrations/20261007-plaza-popularity.sql
npx wrangler deploy --config workers/plaza-checker/wrangler.toml
bash scripts/deploy.sh
```

迁移仅新增 `plaza_feed_stats` 表，保留现有订阅源；可重复运行。新环境完整 schema 也包含此表。上述远端操作仍须用户授权。

## 软件内目录与独立 API（2026-10-08）

新增 `GET /api/limitrss/plaza/v1/feeds`，原网页 API 保持兼容。返回 `schemaVersion:1,total,page,pageSize:30,sort,filters,feeds`。每个 feed 含 id/title/url/icon/category/language/status/checkedAt/createdAt/latencyMs/copyCount/importCount/popularity，时间为毫秒，未知值为 null；仅公开来源可读取。`filters` 含 categories/statuses/languages，language 是源声明的语言而非用户 UI 语言。

参数：`q`（标题或地址，最多100字符）、`category`、`status`（healthy/degraded/failed/unknown）、`language`（如 zh 匹配 zh-cn；unknown 表示未标注）、`sort`（popularity 默认 / newest / name）、`page`。热度相同按添加时间降序，再按 ID 稳定排序。详情 `GET /v1/feeds/:id`，热度计数 `POST /v1/feeds/:id/interaction`，与原详情、计数接口语义及限流相同。全部公开字段都有返回，不返回内部检测失败原因、IP 哈希或管理信息。

客户端默认使用 Pages 项目域名 `https://limit-startup.pages.dev/api/limitrss/plaza/v1/feeds`，不经过官网自定义域名的人机验证。官网仍可使用 Turnstile；不得给 App JSON 接口添加网页挑战、登录重定向或 cookie 验证。客户端检测 HTML / cf-mitigated，显示本地化错误并记录诊断，不尝试绕过挑战。

未来若进一步保护网站，推荐独立部署 `workers/plaza-api/wrangler.toml`，保留 `workers_dev = true`：该 Worker 直接绑定同一个 D1，仅提供列表、详情和交互计数，不反向请求官网。软件构建时设置：

```sh
flutter build <目标> --dart-define=PLAZA_DIRECTORY_API=https://limitrss-plaza-api.<实际账号子域>.workers.dev/api/limitrss/plaza/v1/feeds
```

发布前先 `npx wrangler deploy --dry-run --config workers/plaza-api/wrangler.toml` 验证构建；获部署授权后才运行不带 dry-run 的命令，使用实际输出域名构建客户端。该功能未新增数据库迁移；需已有 plaza_feed_stats 表。

Cloudflare 规则不能仅靠客户端代码保证：普通 Bot Fight Mode 不能通过 WAF Skip 规则豁免。不要将该 API 入口置于网站 Bot Fight Mode、Cloudflare Access 或 Managed Challenge 之下；使用独立 workers.dev 域名隔离网站区域规则。使用自定义 API 域名时仍需单独核验其防火墙设置。上线验收必须使用无浏览器 cookie 的 GET 和 POST 验证 JSON、分页及限流，确保无挑战。参考官方文档：https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ 和 https://developers.cloudflare.com/waf/custom-rules/skip/options/ 。
