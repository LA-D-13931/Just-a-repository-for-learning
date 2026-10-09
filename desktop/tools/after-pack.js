/* ==========================================================================
   electron-builder afterPack 钩子（第 28 节 · 防篡改）
   --------------------------------------------------------------------------
   1) 施加 Electron Fuses（electron-builder 25 不支持 electronFuses 配置项，
      故用官方 @electron/fuses 手动施加）：
        · RunAsNode                       关（禁止把应用当 node 用）
        · EnableNodeOptionsEnvironmentVariable 关（禁止 NODE_OPTIONS 注入）
        · EnableNodeCliInspectArguments   关（禁止 --inspect 调试注入）
        · OnlyLoadAppFromAsar             开（只从 app.asar 加载，源码不裸奔）
        · EnableEmbeddedAsarIntegrityValidation 开（启动时校验 asar 完整性）
   2) 把 asarIntegrity 写入可执行文件（@electron/fuses 在 Electron ≥ 30 会
      自动带上 asar 头校验所需的 integrity；这里同时把清单交给 seal.sh 生成）。
   ========================================================================== */
'use strict';
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function afterPack(context) {
  const { FuseVersion, FuseV1Options, flipFuses } = require('@electron/fuses');
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productFilename;

  /* 可执行文件路径：mac 在 <name>.app/Contents/MacOS/<name>，win 在 <dir>/<name>.exe */
  let exePath;
  if (context.electronPlatformName === 'darwin') {
    exePath = path.join(appOutDir, productName + '.app', 'Contents', 'MacOS', productName);
  } else if (context.electronPlatformName === 'win32') {
    exePath = path.join(appOutDir, productName + '.exe');
  } else {
    exePath = path.join(appOutDir, productName.toLowerCase());
  }
  if (!fs.existsSync(exePath)) {
    console.log('  ⚠️ afterPack: 未找到可执行文件，跳过 Fuses：' + exePath);
    return;
  }

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.EnableCookieEncryption]: true
  });
  console.log('  ✓ afterPack: Electron Fuses 已施加 → ' + path.basename(exePath));
};
