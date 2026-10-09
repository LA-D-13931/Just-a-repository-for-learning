#!/usr/bin/env bash
# 为分发包生成 SHA-256 校验和文件（第 28 节 · 分发校验和）
# 用法：bash tools/release-checksums.sh <分发包目录>
set -euo pipefail
DIR="${1:?需要目录}"
cd "$DIR"
n=0
for f in macOS/*.dmg macOS/*.zip Windows/*.exe; do
  [ -e "$f" ] || continue
  h=$(shasum -a 256 "$f" | awk '{print $1}')
  base=$(basename "$f")
  printf '%s  %s\n' "$h" "$base" > "$f.sha256"
  printf '  ✓ %-46s %s\n' "$base.sha256" "${h:0:16}…"
  n=$((n+1))
done
echo "  共生成 $n 个校验和文件"
echo
echo "  用户验证方法："
echo "    macOS  : shasum -a 256 <文件名>"
echo "    Windows: certutil -hashfile <文件名> SHA256"
