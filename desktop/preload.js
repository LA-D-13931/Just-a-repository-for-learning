/* 预加载脚本（第 27.1-3：保持安全隔离）。
   只向页面暴露一个受控能力：请求"用系统浏览器打开某个 https 链接"。
   页面拿不到 Node、拿不到 require、拿不到任意 IPC 通道——只有这一个函数。
   站点自身的页面（site/）不引用它，行为完全不受影响。 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amOpenExternal', function (url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return ipcRenderer.invoke('am:openExternal', url);
  }
  return Promise.resolve(false);
});
