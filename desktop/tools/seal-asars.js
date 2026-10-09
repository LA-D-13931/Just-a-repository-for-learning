#!/usr/bin/env node
/* ==========================================================================
   把完整性清单**封进 app.asar 内部**（而不是放在 Resources 目录）
   --------------------------------------------------------------------------
   为什么：放 Resources 的封签会被"再次 electron-builder"覆盖（实测 Windows 包
   就是这样丢的：seal 之后再跑一次构建 → manifest 被抹掉 → exe 启动即报
   "缺少 manifest.json"。封进 asar 后它与源码同生共死，构建不可能只覆盖其一。

   流程（对每个 app.asar）：
     ① 解出全部文件到临时目录
     ② 生成 manifest（版本/appId/包名/构建时间/关键文件 SHA-256）
     ③ 用工程外私钥签名
     ④ 把 manifest.json / manifest.sig 写回目录，重新 pack
     ⑤ 打印新的 asar 头哈希（Electron 的 asarIntegrity 用的就是它）
   用法：node tools/seal-asars.js <app.asar 路径> <版本号> [--key <私钥>]
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const asarCli = require.resolve('@electron/asar/bin/asar.js');
const asarLib = require('app-builder-lib/out/asar/asar.js');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const asarPath = path.resolve(process.argv[2] || '');
const version = process.argv[3] || '0.0.0';
const { findPrivateKey } = require('./keys-path.js');
const privPath = path.resolve(arg('key', findPrivateKey(__dirname)));

if (!fs.existsSync(asarPath)) { console.error('✗ 未找到 ' + asarPath); process.exit(1); }
if (!fs.existsSync(privPath)) { console.error('✗ 未找到私钥 ' + privPath); process.exit(2); }

/* 需要纳入清单的关键文件（相对 asar 根） */
const KEY_FILES = ['main.js', 'player.html', 'preload.js', 'integrity.js', 'package.json'];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-seal-'));
try {
  execFileSync(process.execPath, [asarCli, 'extract', asarPath, tmp], { stdio: 'pipe' });

  const hashOf = (rel) => {
    const p = path.join(tmp, rel);
    return fs.existsSync(p)
      ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null;
  };

  const pkgPath = path.join(tmp, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};

  /* asar 自身的哈希：pack 之后才知道，故先算"文件清单"，asar 哈希用占位再补 */
  const manifest = {
    schema: 2,
    appId: (pkg.build && pkg.build.appId) || 'com.advmath.study',
    /* ⚠️ 必须取 build.productName（打包后的真实名称），
       不能回退到 pkg.name——那是开发用的包名 advmath-desktop，
       写进清单后运行时会报 "productName 不符"（实测踩过）。 */
    productName: (pkg.build && pkg.build.productName) || '高数学习站',
    version: version,
    builtAt: new Date().toISOString(),
    files: KEY_FILES.filter((f) => hashOf(f)).map((f) => ({
      path: f, sha256: hashOf(f), size: fs.statSync(path.join(tmp, f)).size
    }))
  };
  let text = JSON.stringify(manifest, null, 2) + '\n';
  const write = () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), text);
    const sig = crypto.sign(null, Buffer.from(text), fs.readFileSync(privPath));
    fs.writeFileSync(path.join(tmp, 'manifest.sig'), sig.toString('base64') + '\n');
  };
  write();

  /* pack 一次即可。
     ⚠️ 不要把 asar 的整文件哈希写进它自己的清单：那是自指的
     （改清单 → 改哈希 → 再改清单…永不收敛，实测三次循环后仍不一致）。
     asar 自身的完整性由 Electron 的 asarIntegrity（头哈希）负责，
     运行时的文件级校验负责清单里列出的每个文件，两者互补、无需自指。 */
  const packed = asarPath + '.new';
  execFileSync(process.execPath, [asarCli, 'pack', tmp, packed], { stdio: 'pipe' });
  const asarHash = crypto.createHash('sha256').update(fs.readFileSync(packed)).digest('hex');

  fs.renameSync(packed, asarPath);

  /* ④ 用 electron-builder 的 reader 算 asarIntegrity 需要的头哈希 */
  asarLib.readAsarHeader(asarPath).then(({ header }) => {
    const headerHash = crypto.createHash('sha256').update(header).digest('hex');
    console.log(JSON.stringify({
      ok: true, asar: asarPath, version: version,
      files: manifest.files.map((f) => f.path),
      asarSha256: asarHash, headerSha256: headerHash
    }));
  }).catch((e) => { console.error('✗ 读头失败 ' + e.message); process.exit(3); });
} finally {
  setTimeout(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }, 1500);
}
