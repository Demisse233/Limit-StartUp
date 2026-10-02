# 部署：已上线到 www.demisse.cn/limitrss

**状态：已上线并验证通过。**

## 实际部署链路（和最初设想的完全不同）

排查后发现这个仓库**不是部署到 Cloudflare**，而是：

```
git push  →  GitHub Actions (.github/workflows/deploy.yml)
          →  Retinbox Web Hosting（site: "demisse"）
          →  https://www.demisse.cn/limitrss/
```

`on: push` 触发，`outdir: "."` 整仓库发布。**push 即上线，不需要 wrangler、不需要 Cloudflare token。**

> 仓库里的 `wrangler.toml` 和 `scripts/deploy.sh`（部署到 Cloudflare Pages 项目
> `limit-startup`）是**另一条未被使用的路径**：`node_modules/.bin/wrangler` 并不存在，
> 而且 wrangler 4 需要 Node ≥ 22（本机 v20.18.0）。**别走这条，直接 push 就行。**

## 挂载位置

```
/Users/demisse/个人项目/Limit/Limit StartUp/
├── index.html          原有站点，未改动
├── _headers            已追加 /limitrss/* 规则（Retinbox 不读，仅为兼容其他托管商保留）
├── functions/api/*     原有 Pages Functions
└── limitrss/           本站（71 个文件，2.2 MB）
```

访问：**https://www.demisse.cn/limitrss/**

## 已做的改动

1. **limitrss/** —— 从 LimitRSS 项目 `npm run build-dist` 导出后整体放入
   （已按 `.assetsignore` 过滤，不含开发记录与工具链）
2. **_headers** —— 追加 24 行 `/limitrss/*` 规则
3. **index.html** —— 新增 V4.2.0 版本 article + hero 徽章升到 4.2.0
4. 版本号 `V4.1.0 → V4.2.0`（"增加新功能"按 AGENTS.md 第 5 条）
5. commit `b74d24d`「V4.2.0 LimitRSS 官网子站」已推送到 `origin/main`

## 已实测的线上结果

用真实浏览器访问线上地址：

| 检查项 | 结果 |
|---|---|
| `/limitrss/` 首页 | 200，15 张图片全部加载成功（五端 logo、截图、图标） |
| `/limitrss/changelog.html` | 200（308 跳到 clean URL `/limitrss/changelog`），**控制台零报错** |
| 运行时读取 markdown | `{"ok":true,"source":"markdown-file","path":"./notes/changelog.md","versions":3,"errors":[]}` |
| 三张版本卡 | 全部 `opacity: 1`、`is-visible` |
| 徽章 | 通用更新 / macOS / iOS / Android / HarmonyOS 齐全 |
| `.mjs` MIME | `text/javascript` ✅（托管商自动处理，不必配 `_headers`） |
| `.md` MIME | `text/markdown` ✅ |
| 原站点 `www.demisse.cn/` | 200，标题 "Limit Startup" 正常 |
| 原站点 `/api/health` | 200 `{"ok":true}` —— **后端 API 未受影响** |

### 一个需要注意的行为：catch-all 路由

Retinbox 对**任何不存在的路径**都返回 `index.html`（200，286927 字节）。
所以下面这些 200 **不代表文件泄漏**，只是 SPA 兜底：

```
/.workbuddy/memory/…   → 200  text/html  286927 B  ← 就是首页
/limitrss/package.json → 200  text/html  286927 B  ← 就是首页
```

真正的安全依据是**文件是否进了 git 仓库**，已核实：

```
.workbuddy 被跟踪文件数: 0        （LimitRSS-website 本身也不是 git 仓库）
仓库内开发记录: 无
limitrss/ 被跟踪内容: assets changelog.html data index.html notes script.js src styles.css
```

### clean URL 的一个小优化（可选）

托管商启用了 clean URL，`changelog.html` 会 308 跳到 `changelog`。
页面里的链接仍写 `href="changelog.html"`，因此每次点击多一次往返。
功能无影响，介意的话可以把 `limitrss/index.html` 里的
`href="changelog.html"` 改成 `href="changelog"`。
**不改也完全能用。**

---

## 以后怎么更新

### 只改更新日志内容

直接编辑 `limitrss/notes/changelog.md`，然后 push。因为页面是**运行时读它**的，
push 后刷新即生效，不需要跑任何构建。

### 改了 LimitRSS 官网本体（样式/结构/数据）

在 LimitRSS 项目里操作，然后同步过来：

```bash
cd /Users/demisse/个人项目/LimitRSS-website
npm run sync          # 更新静态副本 + 首页版本号 + 内嵌兜底
npm run build-dist    # 导出到 /tmp/limitrss-dist

TARGET="/Users/demisse/个人项目/Limit/Limit StartUp/limitrss"
cp -R /tmp/limitrss-dist/. "$TARGET/"
rm -f "$TARGET/_headers"      # 这份不该存在（Cloudflare 只读根目录那份）

cd "/Users/demisse/个人项目/Limit/Limit StartUp"
git add limitrss && git commit -m "VX.Y.Z 更新 LimitRSS 官网" && git push
```

### push 时若报网络错误

这台机器的 git 直连 GitHub 不通，但本地有代理 `127.0.0.1:7897`。代理对
**较大的 POST 会断连**（`curl 52 Empty reply from server`），解决办法是禁用 keep-alive：

```bash
git -c http.proxy=http://127.0.0.1:7897 \
    -c https.proxy=http://127.0.0.1:7897 \
    -c http.version=HTTP/1.0 \
    -c core.compression=1 \
    push origin main
```

（`http.version=HTTP/1.0` 会让 git 打一条 `unknown value` 警告，但实测有效——
这是唯一能推成功的组合。）

---

## 想改成独立域名

把 `_headers` 里 `/limitrss` 前缀去掉即可；代码里没有绝对路径，放根目录也能跑。
