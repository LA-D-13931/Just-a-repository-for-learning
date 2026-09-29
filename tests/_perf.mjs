import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'fs';
const BASE='file:///Users/a18760/Desktop/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E8%B5%84%E6%BA%90%E7%AB%99%E5%B7%A5%E4%BD%9C%E5%8C%BA/_inbox/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99_v0.7.2/%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E5%AD%A6%E4%B9%A0%E7%AB%99/';
const exe=['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
const MJ=readFileSync('/tmp/mj/tex-svg.js','utf8');
const b=await puppeteer.launch({executablePath:exe,headless:'shell',args:['--no-sandbox','--disable-gpu']});
const page=await b.newPage();
await page.setRequestInterception(true);
page.on('request',r=>{ if(r.url().indexOf('mathjax')>=0&&r.url().endsWith('.js')) r.respond({status:200,contentType:'application/javascript',body:MJ}); else r.continue(); });
await page.setViewport({width:1440,height:900});
for (const p of ['chapters/ch1.html','chapters/ch3.html']) {
  await page.goto(BASE+p,{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,2500));
  const stats = await page.evaluate(async ()=>{
    const grip=document.querySelector('.sidebar-grip');
    if(!grip) return {err:'无 grip（窄屏？）'};
    const r=grip.getBoundingClientRect();
    const y=r.top+40;
    // 记录拖动期间的帧间隔
    const frames=[];
    let last=performance.now(), raf=0, stop=false;
    function tick(now){ frames.push(now-last); last=now; if(!stop) raf=requestAnimationFrame(tick); }
    raf=requestAnimationFrame(tick);
    // 模拟 60 次 mousemove（相当于拖动 1 秒）
    grip.dispatchEvent(new MouseEvent('mousedown',{clientX:r.left+5,clientY:y,bubbles:true}));
    for (let i=0;i<60;i++){
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:r.left+5+i*1.6,clientY:y,bubbles:true}));
      await new Promise(rq=>requestAnimationFrame(rq));
    }
    window.dispatchEvent(new MouseEvent('mouseup',{clientX:r.left+100,clientY:y,bubbles:true}));
    stop=true; cancelAnimationFrame(raf);
    await new Promise(rq=>setTimeout(rq,400));
    const n=frames.length;
    const avg=frames.reduce((a,c)=>a+c,0)/n;
    const sorted=[...frames].sort((a,c)=>a-c);
    return { frames:n, avgMs:+avg.toFixed(2), p95Ms:+sorted[Math.floor(n*0.95)].toFixed(2),
             maxMs:+sorted[n-1].toFixed(2), longFrames:frames.filter(f=>f>50).length,
             plotCount:document.querySelectorAll('svg.plot').length };
  });
  console.log(`  ${p}:`, JSON.stringify(stats));
}
await b.close();
