# LimitRSS 更新接口

只维护 `limitrss/notes/changelog.md`。`bash scripts/deploy.sh` 会先执行
`npm run sync:limitrss`，生成日志快照、日志页面兜底、检查更新 JSON/JS
以及各平台下载接口，再校验版本和安装包状态一致，成功后才上传。

最新版本取日志的顶部版本，安装包可用性取 GitHub Releases 实际资产。
日志有新版而某平台没有新版安装包时，该平台 `upToDateWithLatest` 为
`false`，客户端可显示“新版本即将就绪”。不要手动修改生成接口。

GitHub 查询失败时会打印警告并保留已有安装包清单，不会把未确认的新包
标为可用；没有已有清单时停止部署。当前配置仓库为
`Demisse233/LimitRSS_Releases`，应确保其公开 Releases API 可访问。

本地验证：`npm run test:limitrss-update`。
离线生成：`npm run sync:limitrss -- --offline`（保留已有包清单）。
正常部署始终查询 GitHub，不使用离线参数。

公开安装包仓库为 `Demisse233/LimitRSS_Releases`。Pages Functions 自动读取其公开
Releases 清单（5 分钟缓存），提供 `/limitrss/data/downloads.json` 和原有固定下载
JSON 地址，无须随每次发版重新部署网站。GitHub 临时故障时使用上次已确认清单；
没有缓存时回退部署时生成的公开清单，不暴露任何私有仓库凭据。

macOS 下载接口支持 `?arch=arm64` / `?arch=x86_64`，Windows 支持
`?arch=x64` / `?arch=arm64`。不带参数时分别默认为 Apple 芯片和 Windows x64，
响应中的 `variants` 包含所有可用架构。官网芯片选择器只提供实际已上传的文件。

iOS IPA 需要重签后安装。鸿蒙保留当前申请内测入口，未上传 HAP 时不会生成下载链接。

测试：`node --test scripts/test-downloads.mjs scripts/test-limitrss-update.mjs`。
