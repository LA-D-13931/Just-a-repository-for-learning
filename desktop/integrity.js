/* ==========================================================================
   启动完整性校验（第 28 节 · 防篡改）
   --------------------------------------------------------------------------
   流程（全部本地完成，不联网、不加密内容、不激活、不绑定设备）：
     ① 读 resources/manifest.json 与 resources/manifest.sig
     ② 用**内置公钥**验签（私钥在构建机上，从不进包）
     ③ 按清单重算 app.asar 内关键文件的 SHA-256 并逐项比对
     ④ 校验 appId / productName / version 与代码内预期值一致（防重打包）
   任一项失败：返回 { ok:false, reason }，由 main.js 弹窗提示并退出，
   同时写一条日志到 logs/（保留最近 10 次）。
   ========================================================================== */
'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
/* 读取 app.asar 必须用 Electron 的 original-fs：
   启用 OnlyLoadAppFromAsar 与 EnableEmbeddedAsarIntegrityValidation 之后，
   node:fs 不能打开 .asar（实测日志 "无法读取 app.asar：ENOENT"，
   而同一路径 fs.existsSync 为真）。original-fs 是 Electron 提供的、
   能按 asar 语义读取的 fs 实现；在非 Electron 环境（单元测试）回退到 node:fs。 */
let fs;
try { fs = require('original-fs'); } catch (e) { fs = require('node:fs'); }

/* 内置公钥（构建时由 tools/keys/manifest-public.pem 同步而来） */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAKm8O9I3KYadMkM1RuNOaeEHGYhY1mfx4sC5/RlSwUjc=
-----END PUBLIC KEY-----`;

/* 代码内预期身份（防重打包：改了 appId/名称/版本就对不上） */
const EXPECT = { appId: 'com.advmath.study', productName: '高数学习站' };

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/* 读 asar 头 + 按路径取文件内容（清单、签名、关键文件都在 asar 内部）。
   返回 { buf, get(path) }，只读打开一次。 */
function asarOpen(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const jbuf = Buffer.alloc(jsonLen);
  fs.readSync(fd, jbuf, 0, jsonLen, 16);
  /* ⚠️ 数据区基址是 8 + headerSize（headerSize 已含 4 字节长度前缀）。
     曾错用 16 + jsonLen，差 2 字节 → 读到的清单文本多出前导字符、
     验签必失败（实测日志"清单签名无效"）。 */
  const base = 8 + head.readUInt32LE(4);
  const index = {};
  (function walk(node, prefix) {
    for (const [name, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (v.files) { walk(v, p); continue; }
      index[p] = { offset: Number(v.offset), size: v.size };
    }
  })(JSON.parse(jbuf.toString('utf8')), '');
  return {
    index: index,
    get: function (p) {
      const e = index[p];
      if (!e) return null;
      const b = Buffer.alloc(e.size);
      fs.readSync(fd, b, 0, e.size, base + e.offset);
      return b;
    },
    close: function () { try { fs.closeSync(fd); } catch (e) {} }
  };
}

/* 从 asar 头读文件内容（不落盘解包） */
function asarRead(asarPath, wanted) {
  const fd = fs.openSync(asarPath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const jbuf = Buffer.alloc(jsonLen);
  fs.readSync(fd, jbuf, 0, jsonLen, 16);
  const base = 16 + jsonLen;
  const header = JSON.parse(jbuf.toString('utf8'));
  const out = {};
  (function walk(node, prefix) {
    for (const [name, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (v.files) { walk(v, p); continue; }
      if (!wanted.includes(p)) continue;
      const b = Buffer.alloc(v.size);
      fs.readSync(fd, b, 0, v.size, base + Number(v.offset));
      out[p] = sha256(b);
    }
  })(header, '');
  fs.closeSync(fd);
  return out;
}

/* 校验日志：logs/ 目录，保留最近 10 次 */
function writeLog(logDir, line) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const f = path.join(logDir, 'integrity.log');
    const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
    lines.push(new Date().toISOString() + '  ' + line);
    fs.writeFileSync(f, lines.slice(-10).join('\n') + '\n');
  } catch (e) { /* 日志失败不影响判定 */ }
}

/**
 * @param {string} resourcesDir 打包后的 Resources 目录（含 app.asar 与 manifest.*）
 * @param {string} logDir       日志目录
 * @param {{appId?:string, version?:string, packaged?:boolean}} opts
 */
function verify(resourcesDir, logDir, opts) {
  opts = opts || {};
  const T = Date.now();
  const fail = (reason) => {
    writeLog(logDir, 'FAIL  ' + reason + '  (耗时 ' + (Date.now() - T) + 'ms)');
    return { ok: false, reason: reason, ms: Date.now() - T };
  };

  const aPath = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(aPath)) return fail('缺少 app.asar');

  /* 清单与签名都在 asar **内部**：这样构建流程无法只覆盖其一
     （曾把清单放在 Resources，结果再跑一次 electron-builder 就把它抹掉，
       exe 启动即报"缺少 manifest.json"，实测踩过）。 */
  let opened;
  try { opened = asarOpen(aPath); }
  catch (e) { return fail('无法读取 app.asar：' + e.message); }
  const mBuf = opened.get('manifest.json');
  const sBuf = opened.get('manifest.sig');
  if (!mBuf || !sBuf) { opened.close(); return fail('asar 内缺少 manifest.json 或 manifest.sig'); }
  const manifestText = mBuf.toString('utf8');
  const sig = Buffer.from(sBuf.toString('utf8').trim(), 'base64');

  /* ① 验签 */
  let signed = false;
  try {
    signed = crypto.verify(null, Buffer.from(manifestText), PUBLIC_KEY_PEM, sig);
  } catch (e) { signed = false; }
  if (!signed) return fail('清单签名无效（manifest.json 被改动或来源非本工程）');

  let m;
  try { m = JSON.parse(manifestText); } catch (e) { return fail('manifest.json 无法解析'); }

  /* ② 身份一致性（防重打包） */
  if (m.appId !== EXPECT.appId) return fail('appId 不符：' + m.appId);
  if (m.productName !== EXPECT.productName) return fail('productName 不符：' + m.productName);
  if (opts.appId && opts.appId !== EXPECT.appId) return fail('运行时 appId 不符：' + opts.appId);
  if (opts.version && m.version && opts.version !== m.version) {
    return fail('版本号不符：包内 ' + opts.version + '，清单 ' + m.version);
  }

  /* ③ 关键文件哈希 */
  for (const f of m.files || []) {
    const b = opened.get(f.path);
    if (!b) { opened.close(); return fail('asar 内缺少文件：' + f.path); }
    if (sha256(b) !== f.sha256) { opened.close(); return fail('文件已被修改：' + f.path); }
  }
  opened.close();
  const ms = Date.now() - T;
  writeLog(logDir, 'OK    校验通过 v' + m.version + '  关键文件 ' + (m.files || []).length + ' 个  耗时 ' + ms + 'ms');
  return { ok: true, manifest: m, ms: ms };
}

module.exports = { verify: verify, EXPECT: EXPECT };
