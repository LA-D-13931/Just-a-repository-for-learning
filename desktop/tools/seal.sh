#!/usr/bin/env bash
# ==========================================================================
# 打包后封签：生成并签名完整性清单 → 放进应用 Resources → 出分发校验和
# 用法：bash tools/seal.sh <解包目录> <版本号>
#   例：bash tools/seal.sh ../../高等数学学习站_桌面安装包/mac-universal/高数学习站.app/Contents/Resources 0.7.94
# 私钥默认取工程外的 ../../../../../.keys/manifest-private.pem（可用 KEY= 覆盖）
# ==========================================================================
set -euo pipefail
RES_DIR="${1:?需要 Resources 目录}"
VER="${2:?需要版本号}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# 向上搜索私钥（不再写死上溯 5 级）：深度变了也不会失联
find_keys() {
  local d="$HERE"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if [ -f "$d/.keys/manifest-private.pem" ]; then printf '%s' "$d/.keys/manifest-private.pem"; return 0; fi
    local up; up="$(dirname "$d")"
    [ "$up" = "$d" ] && break
    d="$up"
  done
  return 1
}
KEY="${KEY:-$(find_keys || printf '%s' "$HERE/.keys/manifest-private.pem")}"

echo "── 生成清单并签名 ─────────────────────────"
node "$HERE/gen-manifest.js" --app-dir "$RES_DIR" --version "$VER" --key "$KEY"

echo "── 校验签名可被内置公钥验证 ───────────────"
node -e '
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const res=process.argv[1];
const pub=fs.readFileSync(path.join(process.argv[2],"keys","manifest-public.pem"));
const m=fs.readFileSync(path.join(res,"manifest.json"));
const s=Buffer.from(fs.readFileSync(path.join(res,"manifest.sig"),"utf8").trim(),"base64");
const ok=crypto.verify(null,m,pub,s);
console.log(ok?"  ✓ 验签通过":"  ✗ 验签失败");
process.exit(ok?0:1);
' "$RES_DIR" "$HERE"

echo "── 用打包后的客户端模块自检（含哈希比对）──"
node -e '
const path=require("path");
const integ=require(path.join(process.argv[2],"..","integrity.js"));
const r=integ.verify(process.argv[1], "/tmp/am-seal-logs", {});
console.log("  " + (r.ok ? "✓ 客户端校验通过" : "✗ " + r.reason));
process.exit(r.ok?0:1);
' "$RES_DIR" "$HERE"
