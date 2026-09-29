import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, unlinkSync } from 'fs';
const PAGE = process.env.V_PAGE || 'chapters/ch8.html';
const IDS = (process.env.V_IDS || 'fig-dotcross').split(',');
const BASE = 'file:///Users/a18760/Desktop/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E8%B5%84%E6%BA%90%E7%AB%99%E5%B7%A5%E4%BD%9C%E5%8C%BA/_inbox/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99_v0.7.2/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99/';
const exe = ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
const MJ = readFileSync('/tmp/mj/tex-svg.js','utf8');
const b = await puppeteer.launch({executablePath:exe, headless:'shell', args:['--no-sandbox','--disable-gpu','--no-first-run','--disable-extensions']});
const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await page.setRequestInterception(true);
page.on('request',r=>{ if(r.url().indexOf('mathjax')>=0 && r.url().endsWith('.js')) r.respond({status:200,contentType:'application/javascript',body:MJ}); else r.continue(); });
await page.setViewport({width:1280,height:1000,deviceScaleFactor:2});
await page.goto(BASE+PAGE,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,3600));
for (const id of IDS) {
  const o = await page.evaluate((i)=>{
    const h=document.getElementById(i); const svg=h&&h.querySelector('svg.plot');
    return { ok:!!svg, fn:svg?svg.querySelectorAll('.plot-fn path').length:0,
             arrow:svg?svg.querySelectorAll('.plot-arrow').length:0,
             poly:svg?svg.querySelectorAll('.plot-polygon').length:0,
             bars:svg?svg.querySelectorAll('.plot-bars rect').length:0,
             field:svg?svg.querySelectorAll('.plot-field line').length:0,
             imp:svg?svg.querySelectorAll('.plot-implicit path').length:0 };
  }, id);
  console.log(`  ${id}: svg ${o.ok} · 曲线 ${o.fn} · 箭头 ${o.arrow} · 多边形 ${o.poly} · 矩形 ${o.bars} · 场线 ${o.field} · 隐式 ${o.imp}`);
  try { unlinkSync(`/tmp/figs/${id}.png`); } catch(e) {}
  const el = await page.$('#'+id);
  if (el) { const bb = await el.boundingBox(); if (bb && bb.height > 0) await el.screenshot({path:`/tmp/figs/${id}.png`}); else console.log(`  ⚠️ ${id} 高度为 0，未截图`); }
}
console.log(errs.length ? '  ⚠️ '+errs.slice(0,2).join(' | ') : '  ✓ 无 JS 错误');
await b.close();
