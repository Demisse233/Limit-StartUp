# 检查更新与下载接口

完整接口文档（给客户端接入用）在**客户端仓库**：

```
LimitRSS/API-README.md
```

本页只放站点侧需要知道的信息。

## 接口地址

```
GET /limitrss/api/check-update.json       检查更新
GET /limitrss/api/download/index.json     下载清单（所有平台）
GET /limitrss/api/download/{平台}.json     下载清单（单平台）
GET /limitrss/api/check-update.js         浏览器端副本（JSONP 式全局变量）
```

`{平台}` 取值：`mac` / `windows` / `ios` / `android` / `harmony`

均为静态文件，`Cache-Control: no-store` + `Access-Control-Allow-Origin: *`，
由 `_headers` 里的 `/limitrss/api/*` 规则设置。

## ⚠️ 静态托管的硬限制

Retinbox 对**任何不存在的路径**都返回 `HTTP 200 + 主站 index.html`
（MIME 会被 `_headers` 改成 `application/json`）。所以：

- **做不出真正的 302 重定向**——客户端拿到的状态码永远是 200
- 请求 `/limitrss/api/download/mac`（不带 `.json`）会拿到 200 + HTML，
  客户端可能把网页当安装包保存
- 因此接口**只返回下载地址**，客户端需要再请求一次那个地址

**所有接口都必须以 `.json` 结尾。**

## 这些接口怎么生成的

```
notes/changelog.md                     ← 唯一人工维护的数据源
  ↓ npm run sync
data/changelog.json                    ← 决定「最新版本」与更新说明
data/downloads.json                    ← 查 GitHub Release，决定可用版本与地址
  ↓
api/check-update.json / .js            ← scripts/gen-update-api.mjs
api/download/{index,平台}.json          ← scripts/gen-download-api.mjs
```

`npm run sync` 依次执行四个脚本，全部自动：

```
scripts/sync.mjs                     同步更新日志 → data/changelog.json
scripts/gen-download-manifest.mjs    查 GitHub Release → data/downloads.json
scripts/gen-download-api.mjs         生成下载清单 → api/download/*.json
scripts/gen-update-api.mjs           生成检查更新 → api/check-update.json
```

## 发版流程

```
1. 改 notes/changelog.md 的版本号与条目
2. npm run sync            # 重新生成全部派生文件与接口
3. 把安装包传到 GitHub Release（tag = v<版本号>）
4. 再跑一次 npm run sync    # 让接口认出新上传的包
```

第 3 步后若不重跑 sync，`platforms.<平台>.version` 会停留在上一个版本
（`versions.latest` 仍是最新的，客户端能正确提示"有更新"，只是下载地址指向旧包）。

## 维护约定

- **`limitrss/notes/changelog.md` 的权威副本在部署仓库（Limit StartUp）里**，
  同步方向只能是「部署侧 → 源项目」，**不要反向覆盖**，否则会丢掉部署侧的新条目。
- 接口产物（`api/**`）全部由脚本生成，**不要手工编辑**。
- 改动接口字段时记得同步更新客户端仓库的 `API-README.md`。
