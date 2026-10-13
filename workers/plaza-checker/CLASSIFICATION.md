# Plaza 分类 / Classification

先识别准确的发布站点域名、RSSHub 路由或共享 API 的具体路径，再综合订阅源标题、简介和最多八篇近期文章的标题与摘要。仅从已获取的 RSS/Atom 提取内容，不额外抓取文章网页。英文按词边界匹配；个人博客中偶尔出现一个主题、多个主题分数接近时归为“其他”。站点规则是人工维护的有限名单，不代表所有站点都能识别。

Publisher domains and known routes take priority. Otherwise bounded title, description and recent entry evidence determines the category. Ambiguous feeds stay in Other. This is deterministic classification, not AI. Existing content classifications survive transient network failures. RSSHub health remains Unknown and is never fetched by this checker.

## 部署顺序 / Rollout

本地验证后，经用户确认才执行下面的远程操作。先添加表，再部署 Pages 和 checker，避免运行中的旧数据库缺表。原表数据不删除。

After local validation and user approval, apply the additive schema before deploying Pages and the checker:

```sh
npx wrangler d1 execute limit-startup-db --remote --file workers/plaza-checker/classification-schema.sql
bash scripts/deploy.sh
npx wrangler deploy --config workers/plaza-checker/wrangler.toml
```

现有订阅源没有分类版本记录，将在每五分钟任务中每批最多五个自动重新分类；普通 RSS 检查复用原有网络安全及大小限制，RSSHub 仅根据路由与标题分类，不进行网络请求。失败时记录原因，并等待原来的健康检查重试，不无限立即重试。分类结果进入 Cloudflare 结构化日志（不含 URL、凭据及文章原文），包括来源、版本、分类和订阅源 ID；现有检查日志记录结果、原因和耗时。客户端仍使用原有分类代码及中英文标签，无需更新安装包。

Historical feeds are automatically processed in batches of at most five per scheduled run. Future rule-version changes trigger another pass. Classification logs contain IDs and decisions, never credentials or article bodies. Client category labels and existing diagnostics remain unchanged.

## 人工修正 / Administrative overrides

人工修正仅通过拥有 D1 管理权限的管理员执行，不开放匿名修改接口。查找订阅源 ID 后，生成并审阅 SQL：

Only a D1 administrator can correct categories. Generate and review SQL first (the generator does not contact Cloudflare):

```sh
node scripts/plaza-category-override.mjs <32位订阅源ID> technology > /tmp/plaza-category.sql
npx wrangler d1 execute limit-startup-db --remote --file /tmp/plaza-category.sql
```

可选 / Categories: `technology`, `development`, `news`, `gaming`, `culture`, `life`, `other`.
人工分类不会被定期检查覆盖；把类别设为 `auto` 可以清除人工分类并排队重算。不存在的 ID 不创建孤立记录。命令中的 SQL 不使用 D1 不支持的显式事务；自动检查通过 D1 batch 原子更新，并在写入时读取人工覆盖。

Use `auto` to clear an override and enqueue reclassification. Unknown IDs are ignored. Automatic checks preserve manual overrides atomically, even when an override is added during a network request.
