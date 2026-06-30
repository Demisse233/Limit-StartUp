#!/usr/bin/env bash
# 直接部署 Limit Startup 到 Cloudflare Pages
# 依赖: ~/.zshrc 里有 export CLOUDFLARE_API_TOKEN=...
# 用法: bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# 尝试从 ~/.zshrc 读 token (子 shell 不会自动继承 export)
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ -f ~/.zshrc ]]; then
  set +u
  CLOUDFLARE_API_TOKEN=$(grep -E '^export CLOUDFLARE_API_TOKEN=' ~/.zshrc | tail -1 | sed -E 's/^export CLOUDFLARE_API_TOKEN=["'\''](.*)["'\'']$/\1/')
  export CLOUDFLARE_API_TOKEN
  set -u
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN 未设置, 请在 ~/.zshrc 加上 export CLOUDFLARE_API_TOKEN=\"...\""
  exit 1
fi

# 检查工作区
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo "工作区有未提交改动, 仍会部署 (按规则改完直接部署, 不 commit):"
  git status --short
fi

echo "部署中..."
./node_modules/.bin/wrangler pages deploy . --project-name=limit-startup --commit-dirty=true
echo ""
echo "完成"
