# Project Rules

## 每次更新流程

1. **每完成一个改动**：在 `index.html` 的"更新日志"弹窗的 changelog 里追加一条记录。
   - 追加到**未发布 (unreleased) 容器**里（changelog 顶部第一个 article，标签是斜体蓝色"未发布"）
   - 用户要求 commit 时再把整个 unreleased 容器升 V 号（见第 3 条）
   - 写法简略（一两句话即可），不强求详细
   - 类型用现有的 4 个 chip：`新增` / `改进` / `修复` / `移除`
   - **用户视角**: 只写"做了什么"（用户能看到/感受到的变化），不写"怎么实现"（代码路径/CSS 属性/commit hash/技术细节）。例如：写"关于弹窗"更新日志"区域视觉更整齐"，不写"`.changelog` 加 `padding: 4px 20px 18px`、gap 22→26px"
   - **纯结构性整理不写 changelog**: 只整理已有内容（不改功能的操作，如：清理历史 changelog 文字、重排版本顺序、合并同义 commit message 等）不写 changelog 条目。这些是 "项目卫生"，不是用户能看到的功能变化

1.5. **默认流程：先本地测试，再部署**：
   - 每次改完**先在本地预览/测试**（`index.html` 是纯静态 + Pages Functions，用 `python3 -m http.server 8000` 起本地服务或直接双开 `index.html` 都可以；Functions 部分用 `npx wrangler pages dev .` 跑全栈）
   - 本地确认无问题后，再问用户"是否部署到 Cloudflare"，用户确认后跑 `bash scripts/deploy.sh`
   - **不要**改完就自动跑 `deploy.sh`；部署前必须经过本地验证
   - changelog 条目仍然按第 1 条追加到 unreleased 容器

1.7. **直接部署（不 commit，跳过本地测试的特例）**：用户明确说"先不测了，直接部署 / 先不提交，直接部署"时
   - 跳过本地测试，直接跑 `bash scripts/deploy.sh`（读 `~/.zshrc` 里的 `CLOUDFLARE_API_TOKEN`）
   - **不**自动 commit、**不**升版本号、**不**改 hero 徽章
   - changelog 条目仍然按第 1 条追加到 unreleased 容器
   - 等用户说"提交"时再走第 3 条 commit 流程

2. **合并同类型改动**（重要）：当一个 commit 周期内出现多条"同类"小改动时，**合写成 1 条**，不要每处都起一条。
   - 合并范围：作用于同一对象/同一语义的多处改动（如"4 个弹窗去掉主标题副标题"、"去掉所有 section 内部副标题"）
   - 不合并：跨对象的不同语义改动（如"上线纪念重构" + "header 固定" 是两件事，单独起两条）
   - 合并后用一句总结性描述，能体现"在哪些对象上做了同类事"

3. **用户要求提交（commit）时**：
   - 给这次所有改动**升一个版本号**（即只要发生 commit，版本号 +1）
   - 在 commit 信息顶部写明新版本号（参考之前 `V4.0.0` 的格式）
   - commit 内容中应当包括本周期内所有已写入 changelog 的条目

5. **版本号规则（简单递增）**：
   - 当前最新：`V4.0.10`（已提交, 2026.6.21）
   - 部署: `bash scripts/deploy.sh` (token 在 ~/.zshrc 里, 不进 git)
   - 每次 commit：`V4.0.1 -> V4.0.2 -> V4.0.3 ...`
   - 累计到觉得是个小里程碑（比如 4.0.10）再升次版本 `V4.1.0`
   - 重大重构再升主版本（`V5.0.0`）
   - 写进 hero 徽章 + 更新日志顶部条目 + commit 信息，三处保持一致

## 禁止事项

- 不要把旧版本的 changelog 条目改写到新版本号下
- 不要在用户没要求 commit 时自动 commit
- 不要跳过 changelog 直接 commit
- 不要把不同语义的改动合并成一条；同类多处改动应合并，跨类必须分开
- 不要把同周期内的小改动各起一条 changelog，必须按"合并同类型"原则整理
- 不要绕过 unreleased 容器直接把改动挂到某个 V 号下（除了 commit 升号那一刻）
- 不要跳过本地测试直接部署 `scripts/deploy.sh`；只有用户明确说「先不测了，直接部署」时才走 1.7 例外路径
