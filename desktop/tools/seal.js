#!/usr/bin/env node
/* ==========================================================================
   构建后完整封签（第 28 节 · 防篡改）—— 幂等，可反复跑
   --------------------------------------------------------------------------
   对每个目标产物依次做：
     ① 调 seal-asars.js 把 manifest.json + manifest.sig 写进 app.asar 内部
        （并得到 asar 整文件哈希与 **头哈希**）
     ② 把「头哈希」写回宿主，使 Electron 的 asarIntegrity 仍能通过：
          · macOS  → Info.plist 的 ElectronAsarIntegrity，然后重签 .app 外层
          · Windows→ 可执行文件的 PE 版本资源（与 electron-builder 同款 resedit）
     ③ 打印结果，供后续校验和/报告使用
   为什么必须放在**全部构建之后**：清单放进 asar 会改变 asar 内容，
   而 asarIntegrity 记录的是头哈希——顺序错了就跑不起来（实测踩过：
   Windows 包因为封签被后一次构建覆盖，启动报"缺少 manifest.json"）。
   用法：node tools/seal.js <平台> <版本号> <产物根目录>
        平台：mac | win
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asarLib = require('app-builder-lib/out/asar/asar.js');

const platform = process.argv[2];
const version = process.argv[3] || '0.0.0';
const outDir = path.resolve(process.argv[4] || '.');
const HERE = __dirname;

/* 递归两层找 .app：electron-builder 把它们放在 mac-arm64/、mac-universal/ 子目录里 */
function findApps(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    if (!fs.statSync(p).isDirectory()) continue;
    if (name.endsWith('.app')) { out.push(p); continue; }
    for (const sub of fs.readdirSync(p)) {
      const q = path.join(p, sub);
      if (sub.endsWith('.app') && fs.statSync(q).isDirectory()) out.push(q);
    }
  }
  return out;
}

function sealOneAsar(asarPath) {
  const raw = execFileSync(process.execPath, [path.join(HERE, 'seal-asars.js'), asarPath, version],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(raw.trim().split('\n').pop());
}

function patchMacPlist(appPath, headerHash) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const rel = 'Resources/app.asar';
  execFileSync('/usr/libexec/PlistBuddy',
    ['-c', 'Delete :ElectronAsarIntegrity', plist], { stdio: 'pipe' });
  execFileSync('/usr/libexec/PlistBuddy',
    ['-c', 'Add :ElectronAsarIntegrity dict', plist], { stdio: 'pipe' });
  execFileSync('/usr/libexec/PlistBuddy',
    ['-c', `Add :ElectronAsarIntegrity:${rel} dict`, plist], { stdio: 'pipe' });
  execFileSync('/usr/libexec/PlistBuddy',
    ['-c', 'Add :ElectronAsarIntegrity:' + rel + ':algorithm string SHA256', plist], { stdio: 'pipe' });
  execFileSync('/usr/libexec/PlistBuddy',
    ['-c', 'Add :ElectronAsarIntegrity:' + rel + ':hash string ' + headerHash, plist], { stdio: 'pipe' });
}

function resealApp(appPath) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
}

(async function main() {
  const results = [];
  if (platform === 'mac') {
    for (const app of findApps(outDir)) {
      const asar = path.join(app, 'Contents', 'Resources', 'app.asar');
      if (!fs.existsSync(asar)) { console.log('  · 跳过（无 app.asar）: ' + path.basename(app)); continue; }
      const info = sealOneAsar(asar);
      patchMacPlist(app, info.headerSha256);
      resealApp(app);
      const ok = crypto.createHash('sha256').update(fs.readFileSync(asar)).digest('hex') === info.asarSha256;
      results.push({ app: path.basename(app), version, files: info.files, asarSha256: info.asarSha256, 自述一致: ok });
      console.log('  ✓ ' + path.basename(app) + '  关键文件 ' + info.files.length + ' 个  头哈希 ' + info.headerSha256.slice(0, 16) + '…  自述一致 ' + (ok ? '是' : '否'));
    }
  } else if (platform === 'win') {
    /* Windows 布局：<outDir>/win-unpacked/{高数学习站.exe, resources/app.asar}
       （不是 mac 那种 .app 包）。先封 asar，再把头哈希注入 exe 的 PE 版本资源，
       之后用 `electron-builder --prepackaged <win-unpacked>` 打成 setup/portable，
       这样 exe 里带的就是已封签的 asar。 */
    const { NtExecutable, NtExecutableResource, Resource } = require('resedit');
    const roots = fs.existsSync(outDir) ? fs.readdirSync(outDir)
      .map((n) => path.join(outDir, n))
      .filter((p) => fs.statSync(p).isDirectory()) : [];
    for (const root of roots) {
      const resDir = path.join(root, 'resources');
      const asar = path.join(resDir, 'app.asar');
      if (!fs.existsSync(asar)) continue;
      const info = sealOneAsar(asar);
      /* 找同级的 exe */
      const exe = fs.readdirSync(root).map((n) => path.join(root, n))
        .find((p) => p.endsWith('.exe') && !/elevate/i.test(p));
      if (!exe) { console.log('  ⚠️ 未找到 exe，仅封了 asar: ' + path.basename(root)); continue; }
      /* 与 electron-builder 的 addWinAsarIntegrity 完全同款：往资源表里塞一个
         type=INTEGRITY / id=ELECTRONASAR 的资源项（不是写版本信息字符串——
         那样会 RangeError: Offset is outside the bounds of the DataView）。 */
      const exeData = fs.readFileSync(exe);
      const nt = NtExecutable.from(exeData);
      const res = NtExecutableResource.from(nt);
      const vi = Resource.VersionInfo.fromEntries(res.entries);
      if (vi.length !== 1) { console.log('  ⚠️ 版本资源异常: ' + path.basename(exe)); continue; }
      const langs = vi[0].getAllLanguagesForStringValues();
      if (langs.length !== 1) { console.log('  ⚠️ 语言项异常: ' + path.basename(exe)); continue; }
      const integrityList = [{
        file: 'resources/app.asar', alg: 'SHA256', value: info.headerSha256
      }];
      res.entries.push({
        type: 'INTEGRITY',
        id: 'ELECTRONASAR',
        bin: Buffer.from(JSON.stringify(integrityList)),
        lang: langs[0].lang,
        codepage: langs[0].codepage
      });
      res.outputResource(nt);
      fs.writeFileSync(exe, Buffer.from(nt.generate()));
      console.log('  ✓ ' + path.basename(exe) + '  关键文件 ' + info.files.length +
                  ' 个  头哈希 ' + info.headerSha256.slice(0, 16) + '…');
      results.push({ exe: path.basename(exe), version, files: info.files,
                     asarSha256: info.asarSha256, headerSha256: info.headerSha256 });
    }
    if (!results.length) console.log('  · 未找到可封签的 win-unpacked');
  console.log('SEAL ' + JSON.stringify({ platform, version, results }));
}
})().catch((e) => { console.error('✗ 封签失败: ' + (e && e.stack ? e.stack.split('\n')[0] : e)); process.exit(1); });
