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


## Pages Git 自动部署的依赖安装与构建

Plaza Functions 引用 npm 依赖 fast-xml-parser。纯静态页面的“无构建命令”配置不能继续沿用；打包 Functions 前必须安装依赖。

Cloudflare Pages → limit-startup → Settings → Builds & deployments：

- Root directory：仓库根目录（留空）。
- Build command：npm ci（现有已提交代码即可使用；提交新增 build 脚本后可改为 npm ci && npm run build）
- Build output directory：.
- NODE_VERSION：22（本地 Wrangler 4 需要 Node 22 或以上）。

package.json 与 package-lock.json 必须随代码提交。npm run build 会把 Functions 编译到 .wrangler/pages-build/worker.js 以验证依赖，.assetsignore 已排除该目录；Pages 仍负责正式 Functions 打包和上传。

不要把 fast-xml-parser 标为 external：Cloudflare 运行时不会自动提供这个 npm 包。更改构建设置后重新触发失败的部署；只有线上部署成功才表示服务已更新。

## 网页共建、统计与分享者（2026-10-26）

网页默认每页 10 条，可选 10 / 20 / 30 / 50 条，支持页码跳转；搜索和筛选回到第一页。接口新增可选 `pageSize`，不传时仍为 30，越界页自动回到最后一页。目录返回 `sharer: {nickname,avatarUrl}`，不返回账号 ID 或邮箱。公开头像按来源 ID 获取，仅公开来源可访问；头像或昵称更新后使用账号当前资料。

`POST /api/limitrss/plaza/share` 使用网站已有 Bearer 登录会话，未登录或会话失效返回 401。请求 `{feeds:[{url,title?}]}`，每批最多 10 项，64 KiB。普通 URL 通过现有安全抓取取得原始 RSS/Atom 标题，随后进入原有公开检测流程；RSSHub 保持未知状态。OPML 在浏览器解析，拒绝外部实体与无效 XML，最多 100 个唯一地址、1 MB，分批上传；只重试失败项。重复地址不改变原分享者或来源信息。账号由服务端确定，请求体不能指定分享者。

软件原 POST 上传接口继续匿名，不要求登录。本次没有修改 Flutter / 鸿蒙客户端代码或文案。

`GET /api/limitrss/plaza/stats` 返回 `{contributors,totalFeeds,totalUses}`：共建人数为至少成功新增过一个来源的不同现存账号数（含等待公开检测的来源）；累计使用为历史 `copy_count + import_count` 总和。复制成功和点击导入使用原计数接口，计数成功后刷新顶部统计；这不是独立用户数或客户端最终导入成功数。隐藏来源不重置累计使用。

形象资源直接复制用户提供的透明 PNG，SHA-256 为 `db6d7a307adf1a640cd5d402903b58045d9a37c5a5ebec7a885a50232d2b7042`；顶部仅以 CSS 水平镜像，底部保持原方向，不重画、不改色、不拉伸。顶部使用一个透明圆角矩形同时包住统计与形象，不再使用气泡尾巴或单独的头像边框，黄色亮光和底部粉色爱心独立叠加，作为无障碍隐藏的装饰；底部气泡宽度贴合文案，边框与尾巴连续。

### 上线前迁移（须单独取得部署授权）

先执行 `migrations/20261026-plaza-contributions.sql`，再部署 Pages。该迁移只新增关联表，并按所有者要求将历史未归属的来源关联到现有 Demisse 账号；明确限定历史时间，不认领之后的匿名上传，不覆盖已有归属，不修改热度计数。部署前先确认该账号存在，迁移后核对未归属历史记录数为 0。

```sh
npx wrangler d1 execute limit-startup-db --remote --file migrations/20261026-plaza-contributions.sql
# 核验历史归属后再执行
bash scripts/deploy.sh
```

服务端沿用 `module:plaza` 结构日志，记录网页上传批次、身份/限流结果、失败类型和耗时，不记录 URL、账号资料或凭据。浏览器保留最多 200 条同模块诊断；分享错误时提供“导出诊断”，包含目录、统计、交互和分享成功/失败路径，无用户输入或凭据。

验证：`npm run test:plaza`（含 community 测试）、`npm run build`；本地浏览器验证分页与筛选、未登录跳转、登录返回后分享、RSSHub、OPML 嵌套/去重/非法文件/部分失败/只重试失败项、诊断导出，中英文及深浅色、390px 手机布局。实际互联网来源抓取由测试传输验证，线上身份和数据库迁移需发布后核验。

目录表头“检测状态”右侧提供中英文说明提示，支持悬停、键盘聚焦和点按，Escape 或点按外部关闭；提示放在表格容器之外，避免被横向滚动区域裁切。筛选区不再常驻展示该说明。

检测说明以独立普通脚本加载，不依赖目录模块初始化，因此双击 `file://` 本地 HTML 也可悬停、点按与键盘查看说明；完整目录、统计和账号服务仍需通过 HTTP / Pages Functions 预览。

上线日期由所有者确认为 **2026-10-11**。顶部文案“自上线以来，LimitRSS Plaza 已持续服务 N 天”按北京时间已完成的日历天数计算，上线当天为 0 天，天数数字标蓝，在北京时间午夜或重新显示页面时更新；独立普通脚本同时支持本地 HTML 预览。统计按共建人数、已收录订阅源、累计使用次数排列。`stats` 新增 `totalFeeds`，仅统计公开且未隐藏/删除的来源，不受当前列表搜索与筛选影响。

中英文词典和静态文案切换统一由 `plaza/localization.js` 普通脚本提供，目录页、分享/账号弹窗及管理页在 `file://` 与 HTTP 预览下都能切换。业务模块复用同一份词典；登录页沿用现有普通脚本翻译。接口、登录和分享仍需 HTTP/Pages Functions。切换翻译只替换文字节点，不删除头像、爱心或气泡尾巴。

## 个人管理分享（2026-10-27）

账号菜单新增“管理分享”，进入 `/limitrss/my-shares/`。普通登录用户和管理员在此页都只能查看自己的分享，支持搜索、展示状态过滤、每页 20 条分页和删除确认。无编辑、重新检测或恢复操作。中英文资源复用普通脚本翻译，静态文案可本地双击预览；实际账号和数据功能通过 HTTP/Pages Functions 使用。

- `GET /api/limitrss/my-shares?q=&state=&page=`：服务端从经过会话验证的用户 ID 查询 `plaza_contributions`，忽略外部指定的账号参数，不列出管理员已软删除的记录；返回自己的已公开、待检测、已隐藏来源及版本号。
- `DELETE /api/limitrss/my-shares/:id`：JSON 只接受 `{revision}`，会话、归属和版本均校验。其他人的记录返回 404；并发版本冲突返回 409。个人路由不接受编辑或重新检测方法。管理员全局管理权限不会扩大这个个人接口的范围。
- 按所有者最新要求执行**真实删除**：同一个 D1 batch 事务中，先锁定本次操作标记，将当前复制/导入计数及原分享者 ID 写入 `plaza_usage_archive`，随后删除来源、来源统计、归属、检测控制、分类及包含来源元数据的旧管理审计记录。另保留只含来源 ID、操作者 ID、时间的删除审计。归档失败则整批回滚，不删除来源。
- 归档表不保存 URL、标题、图标或可恢复的来源内容。累计使用统计为在用计数加历史归档计数，共建人数也保留曾参与且账号仍存在的贡献者；公开源数量随删除减少。重新分享同一 URL 会生成新来源，旧使用次数继续保留在历史总数中，不重复计数。
- `migrations/20261026-plaza-contributions.sql` 现同时创建归属、删除审计与历史计数表。此迁移尚未执行到生产；上线前先完成迁移、核验既有来源归属，再部署 Pages。删除实际来源与历史计数归档在用户确认删除时发生。
- 服务端 `plaza_my_shares` 日志及网页诊断记录列表和删除结果、失败类型、状态、耗时，不记录源 URL、搜索内容或凭据。个人页失败时可导出诊断。

验证包括真实 D1 下的身份/归属隔离、管理员个人接口限制、禁止编辑/重新检测、版本冲突、并发删除、真实删除后的公开不可见、历史计数保持、再次分享不重复计数、失败归档回滚；本地隔离账号下验证菜单跳转、分页、过滤、取消/确认删除、中英文、手机布局、退出后清空数据。
