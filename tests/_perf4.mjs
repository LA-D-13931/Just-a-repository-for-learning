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
await page.goto(BASE+'chapters/ch1.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,3000));
const o=await page.evaluate(()=>{
  const root=document.documentElement;
  const t0=performance.now();
  for(let i=0;i<10;i++){ root.style.setProperty('--sidebar-w',(274+i)+'px'); void document.body.offsetWidth; }
  const per=+( (performance.now()-t0)/10 ).toFixed(1);
  return { perReflowMs: per, els: document.getElementsByTagName('*').length };
});
console.log(`    单次重排: ${o.perReflowMs} ms   元素数: ${o.els}`);
await b.close();
