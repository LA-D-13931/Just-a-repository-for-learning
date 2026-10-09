#!/usr/bin/env bash
# ==========================================================================
# 把活动站点的内容同步进「已安装的桌面版 app」——并把这次同步备份下来。
# --------------------------------------------------------------------------
# 为什么需要它：桌面版 app 里的 Contents/Resources/site 是打包时烤进去的副本，
# 改完站点后它不会自己更新。2026-10-08 之前这一步一直是人工/agent 手抄，
# 且 app 里的「当前版本.txt」还停在 v0.7.87（没有任何护栏）。
#
# 用法：
#   bash tools/sync-site.sh [--version 0.9.8] [--app /path/to/高数学习站.app] [--dry-run] [--yes]
#
# 行为：
#   ① 校验目标确实是那个 app（有 Contents/Resources/site 与 app.asar），否则拒绝执行
#   ② 先把 app 里现有的 site 备份到 04_桌面包/历史快照/app-site-before-<版本>-<时间戳>/
#      （只备份 site 目录，约 2MB；不再整份复制 426MB 的 .app）
#   ③ 用与 electron-builder 相同的排除规则，把活动站内容镜像进 app 的 site
#   ④ 写入正确的「当前版本.txt」
# ==========================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DESK="$(cd "$HERE/.." && pwd)"                      # .../高等数学学习站/desktop
SITE_SRC="$(cd "$DESK/.." && pwd)"                  # .../高等数学学习站
WORKSPACE="$(cd "$DESK/../../.." && pwd)"           # 工作区根
BACKUP_ROOT="$WORKSPACE/04_桌面包/历史快照"

VER=""; APP="$HOME/Applications/高数学习站.app"; DRY=0; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VER="$2"; shift 2 ;;
    --app)     APP="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --yes|-y)  YES=1; shift ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done
[ -n "$VER" ] || VER="$(python3 -c "import json,sys;print(json.load(open('$DESK/package.json'))['version'])" 2>/dev/null || echo unknown)"

# ① 目标校验
[ -d "$APP/Contents/Resources" ] || { echo "✗ 不是 app 包：$APP"; exit 1; }
[ -d "$APP/Contents/Resources/site" ] || { echo "✗ 该 app 里没有 Contents/Resources/site"; exit 1; }
[ -f "$APP/Contents/Resources/app.asar" ] || { echo "✗ 该 app 里没有 app.asar"; exit 1; }
[ -f "$SITE_SRC/index.html" ] || { echo "✗ 源站点不像站点（缺 index.html）：$SITE_SRC"; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"
DEST="$APP/Contents/Resources/site"
BACKUP="$BACKUP_ROOT/app-site-before-$VER-$TS"

echo "站点源：$SITE_SRC"
echo "目标  ：$DEST"
echo "版本  ：$VER"
echo

# ② 备份 app 里的现有 site
if [ "$DRY" = "1" ]; then
  echo "[dry-run] 会把现有 site 备份到：$BACKUP"
else
  mkdir -p "$BACKUP"
  rsync -a "$DEST"/ "$BACKUP"/
  echo "✓ 已备份现有 site → $BACKUP"
fi

# ③ 镜像（排除规则与 electron-builder 的 extraResources 保持一致）
EXCLUDES=(--exclude '.git' --exclude '.gitignore' --exclude '.gitattributes'
          --exclude 'desktop' --exclude 'tools' --exclude 'tests'
          --exclude 'node_modules' --exclude '.backup' --exclude '.archify'
          --exclude '*.bak' --exclude '.DS_Store' --exclude '*.tmp' --exclude '*.log'
          --exclude 'AGENTS.md')
if [ "$DRY" = "1" ]; then
  echo "[dry-run] rsync 预览："
  rsync -an --delete --itemize-changes "${EXCLUDES[@]}" "$SITE_SRC"/ "$DEST"/ | head -30
else
  if [ "$YES" != "1" ]; then
    printf '确认把站点内容镜像进上面这个 app？[y/N] '
    read -r ans; [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消"; exit 0; }
  fi
  rsync -a --delete "${EXCLUDES[@]}" "$SITE_SRC"/ "$DEST"/
  printf '# 当前版本 · %s（同步自 %s）\n' "$VER" "$(date '+%Y-%m-%d %H:%M')" > "$DEST/当前版本.txt"
  echo "✓ 站点内容已镜像进 app，版本标记写作 v$VER"
fi

echo
echo "验证："
echo "  diff <(shasum -a 256 \"$DEST/index.html\") <(shasum -a 256 \"$SITE_SRC/index.html\") && echo '内容一致'"
echo "  或直接双击 $APP 看是否为最新内容"
