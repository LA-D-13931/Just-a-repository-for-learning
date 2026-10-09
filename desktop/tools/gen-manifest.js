#!/usr/bin/env node
/* ==========================================================================
   构建后生成完整性清单 + 签名（第 28 节 · 防篡改）
   --------------------------------------------------------------------------
   产出（写到 --out 指定的应用资源目录）：
     manifest.json   版本、appId、包名、构建时间、asar 与关键文件的 SHA-256
     manifest.sig    用本地私钥对 manifest.json 的 Ed25519 签名
   私钥只从本机路径读取（默认 ../../.keys/manifest-private.pem），
   **绝不写入任何被打包进应用的目录**。

   用法：
     node tools/gen-manifest.js --app-dir <asar 所在目录> --version 0.7.94
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const appDir = path.resolve(arg('app-dir', path.join(__dirname, '..', '..')));
const version = arg('version', '0.0.0');
const appId = arg('appid', 'com.advmath.study');
const productName = arg('product', '高数学习站');
const { findPrivateKey } = require('./keys-path.js');
// 向上搜索 .keys/（不再写死上溯 5 级，目录搬家也不会失联）
const privPath = path.resolve(arg('key', findPrivateKey(__dirname)));

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function walkFiles(root, rel, out) {
  const abs = path.join(root, rel);
  for (const name of fs.readdirSync(abs)) {
    const r = rel ? path.join(rel, name) : name;
    const a = path.join(root, r);
    if (fs.statSync(a).isDirectory()) walkFiles(root, r, out);
    else out.push(r);
  }
  return out;
}

const asarPath = path.join(appDir, 'app.asar');
if (!fs.existsSync(asarPath)) {
  console.error('✗ 未找到 app.asar：' + asarPath);
  process.exit(1);
}

/* app.asar 内部的源文件清单（用 asar 的 JSON 头读取，不落盘解包） */
function asarEntries(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const buf = Buffer.alloc(jsonLen);
  fs.readSync(fd, buf, 0, jsonLen, 16);
  fs.closeSync(fd);
  const header = JSON.parse(buf.toString('utf8'));
  const out = [];
  (function walk(node, prefix) {
    for (const [name, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (v.files) walk(v, p);
      else out.push({ path: p, size: v.size, offset: v.offset });
    }
  })(header, '');
  return out;
}

const manifest = {
  schema: 1,
  appId: appId,
  productName: productName,
  version: version,
  builtAt: new Date().toISOString(),
  asar: { file: 'app.asar', sha256: sha256(asarPath), size: fs.statSync(asarPath).size },
  /* 关键源文件：从 asar 头取偏移量直接算哈希（不解包） */
  files: (function () {
    const fd = fs.openSync(asarPath, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const jsonLen = head.readUInt32LE(12);
    const base = 16 + jsonLen;
    const jbuf = Buffer.alloc(jsonLen);
    fs.readSync(fd, jbuf, 0, jsonLen, 16);
    const header = JSON.parse(jbuf.toString('utf8'));
    const want = ['main.js', 'player.html', 'package.json', 'preload.js'];
    const entries = [];
    (function walk(node, prefix) {
      for (const [name, v] of Object.entries(node.files || {})) {
        const p = prefix ? prefix + '/' + name : name;
        if (v.files) { walk(v, p); continue; }
        if (!want.includes(p)) continue;
        const b = Buffer.alloc(v.size);
        fs.readSync(fd, b, 0, v.size, base + Number(v.offset));
        entries.push({ path: p, sha256: crypto.createHash('sha256').update(b).digest('hex'), size: v.size });
      }
    })(header, '');
    fs.closeSync(fd);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  })()
};

const manifestText = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(path.join(appDir, 'manifest.json'), manifestText);

/* 签名 */
if (!fs.existsSync(privPath)) {
  console.error('✗ 未找到私钥：' + privPath);
  console.error('  请先在工程外生成密钥对（见 tools/make-keys.js），或用 --key 指定路径。');
  process.exit(2);
}
const sig = crypto.sign(null, Buffer.from(manifestText), fs.readFileSync(privPath));
fs.writeFileSync(path.join(appDir, 'manifest.sig'), sig.toString('base64') + '\n');
console.log('✓ manifest.json + manifest.sig 已生成');
console.log('  asar sha256 : ' + manifest.asar.sha256.slice(0, 32) + '…');
console.log('  关键文件    : ' + manifest.files.map((f) => f.path).join(', '));
console.log('  输出目录    : ' + appDir);
