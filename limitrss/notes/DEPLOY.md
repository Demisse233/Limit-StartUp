# 部署：把新站挂到 www.demisse.cn/limitrss

## 目标形态

```
www.demisse.cn/            ← 原有网站，完全不动
www.demisse.cn/limitrss/   ← 本站（LimitRSS 官网）
```

**实测结论：本站天然支持子路径部署。** 代码里**没有任何以 `/` 开头的绝对路径**，
全部是 `./`、`../` 相对路径，所以放到任意子目录都能正常工作。

我建了一份「根目录 + limitrss 子目录」的模拟环境实测过：

| 检查 | 结果 |
|---|---|
| `/limitrss/` | 200 |
| `/limitrss/changelog.html` | 200，三张版本卡全部可见 |
| `/limitrss/notes/changelog.md` | 200，`text/markdown` |
| `/limitrss/src/changelog/*.mjs` | 200，`text/javascript` |
| `/limitrss`（无尾斜杠） | 301 → `/limitrss/`（相对路径因此能正确解析） |
| `/`（原网站） | 不受影响 |
| 控制台错误 | 无 |

---

## 推荐做法：把 `/limitrss/` 目录并进现有站点

这是改动最小、最不容易出错的方式，**不需要在 Cloudflare 上配任何路由规则**——
Cloudflare Pages 对 `/limitrss/` 这种带目录 `index.html` 的请求会自动返回该文件。

### 步骤

1. **导出干净的发布目录**（已按 `.assetsignore` 过滤好）：

   ```bash
   cd /Users/demisse/个人项目/LimitRSS-website
   npm run build-dist
   # 产物在 /tmp/limitrss-dist（72 个文件，约 2.0 MB）
   ```

2. **把产物放进你现有站点的仓库**，目录名必须叫 `limitrss`：

   ```
   你的原站点仓库/
   ├── index.html          ← 原有
   ├── （原有的其它文件）
   └── limitrss/           ← 新增：把 /tmp/limitrss-dist 里的内容整体放这里
       ├── index.html
       ├── changelog.html
       ├── _headers        ⚠️ 见下方说明
       ├── notes/changelog.md
       └── ...
   ```

3. **处理 `_headers`**（重要）：

   Cloudflare Pages **只读取站点根目录的那一个 `_headers`**。所以：

   - 如果原站点根目录**已经有** `_headers`：把本站 `_headers` 里 `/limitrss/...` 开头的规则
     **追加**到原文件末尾，然后把 `limitrss/_headers` 删掉。
   - 如果原站点**没有** `_headers`：把本站 `_headers` 移动到**站点根目录**（不是 limitrss 里）。

   > 我写的规则已经全部带 `/limitrss` 前缀，就是为了让你能直接追加、不会影响原站点。

   `_headers` 的作用（缺了会出问题）：

   | 规则 | 缺了会怎样 |
   |---|---|
   | `/limitrss/src/changelog/*` → `text/javascript` | 浏览器拒绝加载 ES 模块，**更新日志整页空白** |
   | `/limitrss/notes/changelog.md` → `text/markdown` + 不缓存 | 改 md 后刷新看不到变化 |
   | `/limitrss/assets/*` 长缓存 | 图片每次访问都回源，稍慢 |

4. **提交并推送**，Cloudflare Pages 会自动构建发布。

5. 访问 <https://www.demisse.cn/limitrss/> 验证。

---

## 另一种做法：独立 Pages 项目 + 路由

如果你不想把文件并进原站点仓库：

1. 新建一个 Pages 项目（例如 `limitrss`），把发布目录传上去，得到类似
   `limitrss.pages.dev`。
2. 在**原站点**的 Cloudflare 配置里加一条路由规则，把 `/limitrss/*` 指向新项目。

这条路要么用 Workers 做代理，要么依赖 Cloudflare 的路由能力，
配置比"并进原仓库"复杂，而且独立项目的部署产物里没有 `/limitrss` 前缀，
`_headers` 的路径规则要相应改回根路径。**除非有明确理由，否则建议走上面那条。**

---

## 发布范围（两个方式都一样）

| 会发布 | 说明 |
|---|---|
| `index.html`、`changelog.html`、`styles.css`、`script.js` | 页面本体 |
| `src/changelog/`（7 个 .mjs） | 运行时：读 md → 解析 → 渲染 |
| `notes/changelog.md` | **更新日志的数据源**，运行时 fetch 它 |
| `data/changelog.json` | md 读不到时的兜底快照 |
| `assets/` | 图标、截图、订阅源 logo |
| `_headers` | 响应头（按上面的说明挪到站点根） |

| **不会**发布 | 原因 |
|---|---|
| `.workbuddy/` | 本地开发记录，**绝不能被公开访问** |
| `.preview/` | 本地截图 |
| `scripts/` | 同步工具链，页面不需要 |
| `package.json`、`changelog.config.json`、`README.md` | 仓库元文件 |

由 [.assetsignore](../.assetsignore) 保证，并有测试守着（`npm test`）。

---

## 上线后必须自查

| 检查项 | 预期 |
|---|---|
| `https://www.demisse.cn/limitrss/` | 首页正常，五端截图与首屏动画正常 |
| `…/limitrss/changelog.html` | 三张版本卡**全部可见** |
| 浏览器控制台 | **无 404**、无 `Failed to load module` |
| `…/limitrss/notes/changelog.md` | 能看到 markdown 源码 |
| `…/limitrss/src/changelog/entry.mjs` | 返回 JS，不是 404 |
| `https://www.demisse.cn/.workbuddy/…` | **必须 404** |
| `https://www.demisse.cn/` | 原网站不受任何影响 |

这几项我在本地用模拟的「根目录 + limitrss 子目录」环境跑过，当前全部通过。

---

## 常见问题

**`/limitrss/` 打开是 404**

检查文件是否真的放在了名为 `limitrss` 的目录下，且里面有 `index.html`。

**更新日志页面空白**

多半是 `_headers` 没配或没放到站点根目录，导致 `.mjs` 被当成未知类型。
按上面自查表访问 `…/limitrss/src/changelog/entry.mjs` 确认。

**改了 `notes/changelog.md` 但线上没变**

`_headers` 给该文件设了 `max-age=0, must-revalidate`，理论上刷新即生效。
若仍未变，硬刷新（⌘⇧R）一次，或在 Cloudflare 后台 Purge Everything。

**首页版本号没跟着更新**

首页版本号来自 `data/changelog.json`，需要跑 `npm run sync` 后
把 `data/changelog.json`、`changelog.html`、`index.html` 一起提交。

**想改成独立域名（如 limitrss.demisse.cn）**

把 `_headers` 里所有 `/limitrss` 前缀去掉即可，其它都不用改
（代码里没有绝对路径，放根目录也能跑）。测试 `deploy.test.mjs` 里有一条断言会提示你同步改。
