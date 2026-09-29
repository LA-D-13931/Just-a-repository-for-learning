import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'fs';
const BASE='file:///Users/a18760/Desktop/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E8%B5%84%E6%BA%90%E7%AB%99%E5%B7%A5%E4%BD%9C%E5%8C%BA/_inbox/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99_v0.7.2/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99/';
const exe=['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
const MJ=readFileSync('/tmp/mj/tex-svg.js','utf8');
const b=await puppeteer.launch({executablePath:exe,headless:'shell',args:['--no-sandbox','--disable-gpu']});
const page=await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await page.setRequestInterception(true);
page.on('request',r=>{ if(r.url().indexOf('mathjax')>=0&&r.url().endsWith('.js')) r.respond({status:200,contentType:'application/javascript',body:MJ}); else r.continue(); });
await page.setViewport({width:1440,height:900});
await page.goto(BASE+'chapters/ch1.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,2500));
const first=await page.evaluate(()=>({首屏:document.querySelectorAll('mjx-container').length,
                                      元素:document.getElementsByTagName('*').length}));
console.log('    首屏:', JSON.stringify(first));
// 逐屏滚到底
await page.evaluate(async ()=>{
  const H=document.body.scrollHeight;
  for(let y=0;y<H;y+=500){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,110)); }
});
await new Promise(r=>setTimeout(r,2000));
const o=await page.evaluate(()=>{
  const blocks=[...document.querySelectorAll('.content p, .content li, .content h2, .content figcaption')];
  const leaked=[];
  for (const el of blocks){ if (el.innerText.includes('$')) leaked.push(el.innerText.slice(0,50)); }
  return { 已排版:document.querySelectorAll('mjx-container').length, 元素:document.getElementsByTagName('*').length,
           可见泄漏:leaked.length, 样例:leaked.slice(0,2) };
});
console.log('    滚到底:', JSON.stringify(o));
// 拖帧率
const perf=await page.evaluate(async ()=>{
  window.scrollTo(0,0); await new Promise(r=>setTimeout(r,600));
  const grip=document.querySelector('.sidebar-grip'); const r=grip.getBoundingClientRect(); const y=r.top+40;
  const dt=[]; let stop=false,raf=0,prev=performance.now();
  function tick(now){ dt.push(now-prev); prev=now; if(!stop) raf=requestAnimationFrame(tick); }
  raf=requestAnimationFrame(tick);
  const t0=performance.now();
  grip.dispatchEvent(new MouseEvent('mousedown',{clientX:r.left+5,clientY:y,bubbles:true}));
  for(let i=0;i<50;i++){ window.dispatchEvent(new MouseEvent('mousemove',{clientX:r.left+5+i*2,clientY:y,bubbles:true})); await new Promise(rq=>setTimeout(rq,16)); }
  window.dispatchEvent(new MouseEvent('mouseup',{clientX:r.left+105,clientY:y,bubbles:true}));
  const total=performance.now()-t0; stop=true; cancelAnimationFrame(raf);
  const s=[...dt].sort((a,c)=>a-c);
  return { 拖动总时长ms:+total.toFixed(0), 均帧ms:+(dt.reduce((a,c)=>a+c,0)/dt.length).toFixed(1), p95ms:+s[Math.floor(s.length*0.95)].toFixed(1) };
});
console.log('    拖动:', JSON.stringify(perf));
console.log(errs.length? '  ✗ '+errs.slice(0,2).join(' | ') : '  ✓ 无 JS 错误');
await b.close();
