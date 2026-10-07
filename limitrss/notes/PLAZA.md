# LimitRSS Plaza 运维与接口

## 结构

- `/limitrss/plaza/` 中英文共享广场；首页导航提供入口。
- `functions/api/limitrss/plaza/`：匿名上传、公开列表、公开详情。
- D1：`plaza_feeds`（地址去重）及 `plaza_limits`（按 IP 哈希限流）；与现有 DB 绑定共用数据库，但不修改原表。
- `workers/plaza-checker/`：独立 Cron Worker，定时读取待检查来源。Pages Functions 本身不支持定时触发。

## 检测策略

每 5 分钟运行一轮，最多检测 5 个来源，顺序执行，每个最大 12 秒、1 MiB、最多 4 次请求（包含重定向）。成功后目标 12 小时再检测；失败按 1、2、3…12 小时退避；连续 3 次失败标记连续失败，恢复成功立即归零。首次检测成功之前不公开。已公开来源失败仍保留检测结果。

当前容量约 1440 次检测/天；大量来源会排队，12 小时是目标间隔而非所有规模下的保证。先监控排队长度，扩大规模时拆分批次或使用 Queue，不应直接无限提高每轮数量。

只接受 HTTP(S) 和 rsshub:// 公共路线；拒绝内网/IP 字面量、URL 用户密码、明显凭据查询参数、非默认端口。检查 DNS A 记录和每次重定向，拒绝解析到保留/内网地址；v1 不接受只有 IPv6 地址的站点。RSSHub 用 RSSForever 公共实例检查并保留原始路线。XML 拒绝 HTML、无标题来源、DTD/实体声明及无效 XML。分类根据标题/描述规则，不使用 AI 服务。

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

此操作保留记录，便于恢复；恢复设 `next_check=0` 后通过检测才重新公开。此阶段不含用户账号、评论、热度排序、AI 分类和独立审核后台。匿名上传的滥用先通过限流、检测和人工下架处理。
