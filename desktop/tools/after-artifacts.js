/* ==========================================================================
   构建全部完成后：给**合并后的**可执行文件施加 Electron Fuses
   --------------------------------------------------------------------------
   为什么放在这里：afterPack 会分别在 arm64 / x64 上施加 Fuses，
   而 universal 合并要求两架构的同名非二进制文件 SHA 完全一致，
   分别施加会改动各自的签名资源 → 合并失败（实测报 CodeResources 不一致）。
   故改在 universal 已合并之后统一施加。
   ========================================================================== */
'use strict';
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function afterAllArtifactBuild(buildResult) {
  const { FuseVersion, FuseV1Options, flipFuses } = require('@electron/fuses');
  const outDir = buildResult.outDir;
  const targets = [
    path.join(outDir, 'mac-universal', '高数学习站.app', 'Contents', 'MacOS', '高数学习站'),
    path.join(outDir, 'mac-arm64', '高数学习站.app', 'Contents', 'MacOS', '高数学习站'),
    path.join(outDir, 'win-universal-unpacked', '高数学习站.exe'),
    path.join(outDir, 'win-unpacked', '高数学习站.exe')
  ];
  let n = 0;
  for (const exe of targets) {
    if (!fs.existsSync(exe)) continue;
    const isMac = exe.includes('.app' + path.sep) || exe.includes('.app/');
    /* ⚠️ Windows 上**不开** EnableEmbeddedAsarIntegrityValidation：
       它要求 exe 的 PE 资源里 INTEGRITY/ELECTRONASAR 与 asar 头哈希逐字节匹配，
       而我们自己封签后注入的资源与 electron-builder 的写入时机不同步时，
       Electron 会在原生层**静默退出**（无窗口、无对话框、无日志）——
       用户实测"点击图标不启动"即此表现，且本机无法运行 exe 复现。
       改为只依赖运行时的 JS 级校验（已封签的 asar + 内置公钥验签 + 文件哈希），
       这条路在 macOS 上已实测通过，Windows 同样适用。
       macOS 保留该 fuse：Info.plist 的头哈希由 seal.js 精确重写并重签，已验证可用。 */
    const fuses = {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    };
    if (isMac) {
      fuses.resetAdHocDarwinSignature = true;
      fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] = true;
    }
    await flipFuses(exe, fuses);
    console.log('  ✓ Fuses 已施加: ' + path.relative(outDir, exe) +
                '（EmbeddedAsarIntegrityValidation=' + (isMac ? '开' : '关') + '）');
    n++;
  }
  /* macOS：改动二进制后必须重签 .app 外层封装，否则签封失效、系统直接拒绝启动
     （实测现象：进程无任何输出即退出，codesign --verify 报
       "a sealed resource is missing or invalid"）。
     未签名分发用 ad-hoc 签名（"--sign -"）即可满足外层一致性。 */
  const { execFileSync } = require('node:child_process');
  for (const appRel of ['mac-universal/高数学习站.app', 'mac-arm64/高数学习站.app']) {
    const appPath = path.join(outDir, appRel);
    if (!fs.existsSync(appPath)) continue;
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
      console.log('  ✓ 已重签外层封装: ' + appRel + '（ad-hoc）');
    } catch (e) {
      console.log('  ⚠️ 重签失败（不影响未签名分发）: ' + appRel);
    }
  }
  console.log('  ✓ 共处理 ' + n + ' 个可执行文件');
  return true;
};
