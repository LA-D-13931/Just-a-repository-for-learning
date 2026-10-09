#!/usr/bin/env bash
# ==========================================================================
# 一键出包（含防篡改封签）—— 顺序至关重要，务必用本脚本而不是手动分步
# --------------------------------------------------------------------------
# 顺序（错一步就会出现"启动报缺少 manifest.json"）：
#   mac : electron-builder --mac --universal → seal.js mac  → hdiutil 生成 DMG
#   win : electron-builder --win --x64 --dir  → seal.js win  → --prepackaged 打成 exe
#          ↑ Windows 必须"先出 unpacked、封签、再用 --prepackaged 打 exe"，
#            否则 exe 里是未封签的 asar（曾实测踩坑：发给用户后启动失败）。
# 用法：bash tools/build-all.sh <版本号>
# ==========================================================================
set -euo pipefail
VER="${1:?用法: bash tools/build-all.sh <版本号>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DESK="$(cd "$HERE/.." && pwd)"
OUT="$(cd "$DESK/../../.." && pwd)/05_构建/高等数学学习站_桌面安装包"   # 构建产物统一放 05_构建（不进仓库）

export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://registry.npmmirror.com/-/binary/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://registry.npmmirror.com/-/binary/electron-builder-binaries/}"
# 可用 EB= 覆盖（例如用 npx、或需要包一层 argv 时）
EB="${EB:-$DESK/node_modules/.bin/electron-builder}"
cd "$DESK"

# ── 预检 ①：版本号必须与 package.json 一致 ───────────────────
# 2026-10-08 修：脚本用 $VER 命名 DMG 并写进封签清单，但 electron-builder 的
# 应用版本取自 package.json。两者不一致时，会产出「文件名写 0.9.8、应用内是 0.9.7」
# 的坏包（实测踩到）。这里强制一致，并给出修法。
PKG_VER="$(node -e "console.log(require('$DESK/package.json').version)" 2>/dev/null || echo unknown)"
if [ "$PKG_VER" != "$VER" ]; then
  echo "✗ 版本号不一致：脚本参数 $VER ≠ package.json $PKG_VER"
  echo "  修法（二选一）："
  echo "    · 想让应用版本变成 ${VER}：  cd \"$DESK\" && npm version $VER --no-git-tag-version"
  echo "    · 或者用现有版本出包：      bash tools/build-all.sh $PKG_VER"
  exit 1
fi
echo "  版本号一致：v$VER"

# ── 预检 ②：缺依赖就立刻失败，不要跑到最后报"完成" ───────────────
[ -x "$EB" ] || { echo "✗ 找不到 electron-builder：$EB"; echo "  先在 desktop/ 里执行 npm install"; exit 1; }
[ -d "$DESK/node_modules/electron" ] || { echo "✗ 缺少 electron 依赖：$DESK/node_modules/electron"; exit 1; }

LOG_DIR="${TMPDIR:-/tmp}/advmath-build-$$"
mkdir -p "$LOG_DIR"

# ── 构建执行器 ──────────────────────────────────────────────
# 2026-10-08 修：原来把 electron-builder 的输出直接 `| grep ... || true`，
# 于是构建失败时错误被 grep 吞掉、脚本继续往下跑、最后照样打印"完成"
# （实测出现过：产物 0 个，却报告成功）。现在改为「日志落盘 + 检查退出码 + 断言产物」。
run_eb() {
  local label="$1" name="$2"; shift 2
  local log="$LOG_DIR/$name.log" code=0
  echo "  · $label"
  "$EB" "$@" > "$log" 2>&1 || code=$?
  grep -iE 'Fuses|共处理|⨯|error' "$log" | tail -10 || true
  if [ "$code" -ne 0 ]; then
    echo "  ✗ 构建失败（退出码 ${code}）：$label"
    echo "  ── 日志尾部（完整日志：${log}）──"
    tail -25 "$log"
    exit 1
  fi
}
# ────────────────────────────────────────────────────────────

echo "── ① macOS 构建 ────────────────────────────"
run_eb "macOS 构建（universal）" mac --mac --universal

# electron-builder 的 mac 默认目标里有 zip，而 zip 是**封签之前**打的 →
# 里面的 app.asar 没有 manifest.json / manifest.sig，装到机器上完整性校验会失败。
# 正式产物是下面 hdiutil 生成的 DMG，这些 zip 一律丢弃（2026-10-08 实测确认）。
rm -f "$OUT"/*-mac.zip "$OUT"/*-mac.zip.blockmap

echo "── ② macOS 封签（清单写进 asar 内部 + 改 Info.plist 头哈希 + 重签）──"
node "$HERE/seal.js" mac "$VER" "$OUT"

echo "── ③ DMG（必须 HFS+，本机 hdiutil 用 APFS 会失败）──"
mkdir -p "$OUT/macOS"
for arch in arm64 universal; do
  APP="$OUT/mac-$arch/高数学习站.app"
  [ -d "$APP" ] || continue
  rm -f "$OUT/macOS/高数学习站-$VER-$arch.dmg"
  hdiutil create -srcfolder "$APP" -volname "高数学习站 $VER" \
    -anyowners -nospotlight -format UDZO -fs HFS+ \
    "$OUT/macOS/高数学习站-$VER-$arch.dmg" >/dev/null
  echo "  ✓ 高数学习站-$VER-$arch.dmg"
done

echo "── ④ Windows：先出 unpacked ────────────────"
run_eb "Windows 先出 unpacked" win-dir --win --x64 --dir

echo "── ⑤ Windows 封签 ─────────────────────────"
node "$HERE/seal.js" win "$VER" "$OUT"

echo "── ⑥ Windows：从已封签目录打成 setup + portable ──"
rm -f "$OUT"/高数学习站*.exe
run_eb "Windows 打成 setup + 便携版" win-pack --win --x64 --prepackaged "$OUT/win-unpacked"

echo "── ⑦ 清理未打包的中间产物 ─────────────────"
# ⚠️ 必须做：mac-arm64 / mac-universal / win-unpacked 里各有一份**未被 Spotlight 放过**的
#    .app，会作为额外的"高数学习站"图标出现在启动台/聚焦里（实测用户看到 4 个）。
#    成品已在 DMG/zip/exe 里，这些目录可重新生成，直接删掉。
for d in mac mac-arm64 mac-universal win-unpacked win-universal-unpacked; do
  if [ -d "$OUT/$d" ]; then rm -rf "$OUT/$d"; echo "  ✓ 已删中间产物 $d"; fi
done
rm -f "$OUT"/*.blockmap "$OUT/builder-debug.yml"; rm -rf "$OUT/.icon-ico"
rm -f "$OUT"/*-mac.zip "$OUT"/*-mac.zip.blockmap   # 再次兜底：绝不留下未封签的 zip

echo "── ⑧ 分发校验和 ───────────────────────────"
bash "$HERE/release-checksums.sh" "$OUT"

# ── 断言：没有产物就不许说"完成" ─────────────────────────────
shopt -s nullglob
ARTIFACTS=("$OUT"/macOS/*.dmg "$OUT"/*.exe)
if [ ${#ARTIFACTS[@]} -eq 0 ]; then
  echo
  echo "✗ 构建流程跑完，但 $OUT 里没有任何 dmg/exe 产物。"
  echo "  这不是成功。请检查上面的日志。"
  exit 1
fi
echo
echo "✓ 产物 ${#ARTIFACTS[@]} 个："
for a in "${ARTIFACTS[@]}"; do echo "  · $(basename "$a")  ($(du -h "$a" | cut -f1))"; done
echo "完成。产物在：$OUT"
