#!/usr/bin/env node
/* 生成 Ed25519 密钥对（只在构建机上跑一次）。
   私钥写到 --out（默认工程外的 ../../.keys），**绝不放进应用**。
   用法：node tools/make-keys.js [--out <目录>] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const i = process.argv.indexOf('--out');
const { findKeysDir, findWorkspaceRoot } = require('./keys-path.js');
const defaultKeys = findKeysDir(__dirname)
  || path.join(findWorkspaceRoot(__dirname) || path.join(__dirname, '..'), '.keys');
const out = path.resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaultKeys);
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPath = path.join(out, 'manifest-public.pem');
fs.writeFileSync(path.join(out, 'manifest-private.pem'),
  privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
/* 同步一份公钥进工程（公钥可以进包，用来验签） */
const dst = path.join(__dirname, 'keys', 'manifest-public.pem');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(pubPath, dst);
console.log('✓ 密钥对已生成：' + out);
console.log('  公钥已同步到 tools/keys/manifest-public.pem（可打包）');
