# Plaza 管理后台 / Plaza manager

入口：`https://www.demisse.cn/limitrss/plaza-manager/`。复用官网账号登录和退出；服务端从数据库读取账号邮箱核验，默认仅授权用户指定的 `eric_demisse@163.com`。可用 Pages 服务端变量 `PLAZA_ADMIN_EMAILS`（逗号分隔）替换名单，绝不在前端开放授权或绕过认证。

The standalone manager reuses website authentication. The server authorizes the current database email; `PLAZA_ADMIN_EMAILS` can replace the default owner allowlist. Tokens and credentials never enter logs or audit records.

## 行为 / Behavior

- 全量列表支持搜索、分类、状态和分页；包括待检测、下架及已删除来源。
- 编辑名称、公开订阅地址、图标、分类、语言。语言通过下拉框选择简体中文、繁体中文、英语、日语、韩语等常见语言；分别保存为固定代码（如 `zh-hans`、`zh-hant`、`en`），留空表示未标注。不接受旧地区代码或自由输入。手动分类和语言保留，自动检查不覆盖。
- 下架和删除立即对公开列表、详情及交互接口生效；不物理删除数据。恢复后保持下架，需要手动上架。未通过检测的普通 RSS 上架后仍待检测。
- 已删除来源重新上传也返回重复，不重建、不覆盖。地址修改为已有地址返回冲突，原记录保持不变。
- 修改地址会清除旧健康结果并排队检测。管理员并发修改使用 revision 防止互相覆盖；正在进行的检测仅对原地址和原 revision 写回。
- 状态旁提供“重新检测”，立即执行服务端检测并更新结果；下架来源可检测且保持下架，已删除来源不检测。RSSHub 路由需通过客户端配置的实例检测。检测中禁用按钮，结构化日志记录检测开始、结果、失败原因及耗时。
- 所有管理接口及公开目录返回 `Cache-Control: no-store`。不轮询，不推送，已打开页面不自动更新。
- 操作与前后内容通过 D1 batch 原子保存到 `plaza_admin_audit`，管理页可查看差异。Cloudflare 结构化日志记录结果、错误代码、来源 ID、管理员 ID 和耗时，不包含密码、Token 或订阅内容。

Edits, visibility changes and reversible deletion write directly to D1. Restored records stay hidden until explicitly published. Optimistic revisions prevent stale edits and in-flight checks from overwriting changes. Audits are committed atomically with mutations. All public readers, including the independent app API Worker, honor moderation and disable response caching. Existing open pages are not refreshed automatically.

## 上传兼容 / Upload compatibility

`POST /api/limitrss/plaza` 接受可选 `category` 和 `language`。分类必须是 `technology/development/news/gaming/culture/life/other` 之一；显式 `language: null` 或空字符串表示保留未标注。两字段各自存在时锁定对应用户选择。不提供字段的旧客户端继续使用原有自动识别。任何重复 URL 只返回 `duplicate`，不覆盖已有元数据。软件内建议识别和确认表单将在客户端后续适配，本次不修改安装包。

Optional upload fields lock the confirmed metadata independently. Legacy clients still receive automatic classification/language detection. Duplicate URLs return `duplicate` without changing existing records. The client-side suggestion and confirmation UI is a separate follow-up.

## 首次上线 / First rollout

本地验证后，经用户确认进行首次部署。数据库 schema 必须先创建，Pages、checker 和独立 app API Worker 必须一起升级；保留所有现有记录，不执行删除。若旧分类 schema 还没应用，也需先应用一次。不要只部署页面，否则旧 Worker 可能重新公开下架来源。

```sh
npx wrangler d1 execute limit-startup-db --remote --file workers/plaza-checker/classification-schema.sql
npx wrangler d1 execute limit-startup-db --remote --file workers/plaza-checker/management-schema.sql
bash scripts/deploy.sh
npx wrangler deploy --config workers/plaza-checker/wrangler.toml
npx wrangler deploy --config workers/plaza-api/wrangler.toml
```

The additive schemas precede the three runtime deployments. No existing feeds are removed. This initial rollout is required once; subsequent feed edits need no deployment.

## 验证 / Validation

`npm run test:plaza` 使用真实本地 SQLite/D1，覆盖认证及权限、分类语言保留、重复上传、编辑审计、并发冲突、所有公开接口的下架删除、恢复和旧检测结果丢弃。`npm run build` 编译 Pages Functions；两个 Worker 用 dry-run 验证。管理 UI 使用本地合成账号与数据验证，不读取或修改生产订阅源。

Manual rechecks run immediately and update health without publishing hidden feeds. Deleted feeds cannot be checked. RSSHub routes require the configured client instance; their recheck button is disabled. Structured logs record start, result, failure reason and duration.

## Plaza 登录 / Plaza sign-in

广场顶栏的登录入口前往 `/limitrss/login/`，页面采用左右分栏，窄屏保留登录表单。复用 `/api/auth/login`、`/api/auth/me`、`/api/auth/logout` 及现有 StartUp D1 `users` 数据，无需迁移数据库；同源沿用 `ls_auth_token` 与 `ls_auth_user`。仅在用户勾选后本地记住邮箱，不保存密码。人机验证提示位于组件下方。登录后默认返回广场，`next` 仅允许广场和管理后台两个本地路径。登录状态由服务端校验，管理链接根据服务端当前账号权限显示，所有管理接口继续独立验证权限。

The Plaza header links to a standalone split-layout sign-in page. Authentication reuses the existing StartUp endpoints, database and same-origin session. Remember email is opt-in; passwords are never stored. Return URLs are restricted to Plaza and its manager. The server determines management access; hiding or showing the navigation does not grant permissions. Structured login logs contain status, error code and duration without credentials.

登录页采用单 Logo 与语言切换、注册入口；`/limitrss/login/?mode=register` 复用 `/api/auth/register` 创建同一 StartUp 数据库账号，含昵称、密码规则、确认密码与人机验证。注册成功后保存共享会话并返回广场，普通注册用户不获得管理权限。

登录页背景按用户要求使用 Cloudflare Connect 原始地球纹理和独立绘制逻辑，来源记录在 `login/assets/SOURCES.md`。仅本地加载动画资源，调整为蓝白线条并从页面底部裁切；地图嵌入以兼容直接打开 HTML，减少动态效果时使用原静态纹理。
