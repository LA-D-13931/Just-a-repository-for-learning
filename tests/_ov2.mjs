import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'fs';
const exe=['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
const MJ=readFileSync('/tmp/mj/tex-svg.js','utf8');
async function probe(dir, label){
  const BASE='file://'+dir+'/';
  const b=await puppeteer.launch({executablePath:exe,headless:'shell',args:['--no-sandbox','--disable-gpu']});
  const page=await b.newPage();
  await page.setRequestInterception(true);
  page.on('request',r=>{ if(r.url().indexOf('mathjax')>=0&&r.url().endsWith('.js')) r.respond({status:200,contentType:'application/javascript',body:MJ}); else r.continue(); });
  await page.setViewport({width:320,height:800});
  await page.goto(BASE+'chapters/ch1.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction('document.querySelectorAll("mjx-container").length > 0',{timeout:20000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  const o=await page.evaluate(()=>{
    const W=document.documentElement.clientWidth;
    const bad=[]; let maxR=0;
    document.querySelectorAll('body *').forEach(el=>{
      const r=el.getBoundingClientRect();
      if (r.right > W + 2){
        bad.push({tag:el.tagName, w:Math.round(r.width), right:Math.round(r.right),
                  txt:(el.textContent||'').trim().slice(0,34)});
      }
      if (r.right>maxR) maxR=r.right;
    });
    return { W, 最右:Math.round(maxR), 溢出数:bad.length, 前3:bad.slice(0,3),
             已排版:document.querySelectorAll('mjx-container').length };
  });
  console.log(`  ${label}:`, JSON.stringify(o).slice(0,420));
  await b.close();
}
await probe('/tmp/cmptest','对照(无按需排版)');
await probe(process.env.CUR,'当前(按需排版)');
