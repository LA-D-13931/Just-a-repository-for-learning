#!/usr/bin/env node
/* 私钥定位：从本文件所在目录**逐级向上搜索** .keys/，而不是写死「上溯 N 级」。
   --------------------------------------------------------------------------
   为什么：原来四个工具都写死「从 desktop/tools 上溯 5 级」，把私钥位置与
   desktop/ 的目录深度绑死了 —— 工程一搬家（2026-10-08 从 05_构建 迁回活动站）
   就会去找 ~/Desktop/.keys，封签直接失败。改成向上搜索后，深度不再重要。
   仍可用 KEY= 环境变量或 --key/--out 显式覆盖。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** 逐级向上找 .keys/ 目录；找不到返回 null */
function findKeysDir(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.join(dir, '.keys');
    if (fs.existsSync(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** 逐级向上找工作区根（同时含 AGENTS.md 与 00_工作区索引）；找不到返回 null */
function findWorkspaceRoot(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md'))
      && fs.existsSync(path.join(dir, '00_工作区索引'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** 私钥绝对路径；keyDir 不存在时回落到工作区根的 .keys/ */
function findPrivateKey(start) {
  const keysDir = findKeysDir(start)
    || path.join(findWorkspaceRoot(start) || path.resolve(start, '..'), '.keys');
  return path.join(keysDir, 'manifest-private.pem');
}

module.exports = { findKeysDir, findWorkspaceRoot, findPrivateKey };
