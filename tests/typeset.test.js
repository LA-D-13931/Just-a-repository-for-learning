import puppeteer from 'puppeteer-core';
import fs from 'fs'; import path from 'path';
const EDGE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const b=await puppeteer.launch({executablePath:EDGE,headless:'shell',protocolTimeout:180000,args:['--allow-file-access-from-files','--disable-gpu']});
const ROOT=path.resolve(process.cwd(),'..');
const pages=fs.readdirSync(path.join(ROOT,'chapters')).filter(f=>f.endsWith('.html')).map(f=>'chapters/'+f)
  .concat(fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')));
let bad=0;
for(const f of pages){
  const p=await b.newPage(); await p.setViewport({width:1440,height:900});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,80)));
  await p.goto('file://'+path.join(ROOT,f),{waitUntil:'load'});
  // 滚到页底触发全部懒排版
  await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=1200){window.scrollTo(0,y); await new Promise(r=>setTimeout(r,60));} window.scrollTo(0,document.body.scrollHeight); });
  await new Promise(r=>setTimeout(r,2500));
  const r=await p.evaluate(()=>{
    const SEL=window.__TYPESET_SEL||'p,li,h2,h3,h4,td,th,figcaption,.box-title,.example-head';
    let left=0;
    document.querySelectorAll(SEL).forEach(el=>{
      if(el.querySelector('mjx-container')) return;
      for(const n of el.childNodes) if(n.nodeType===3 && /\$[^$]{1,200}\$/.test(n.nodeValue||'')) {left++;break;}
    });
    return {left, mjx:document.querySelectorAll('mjx-container').length, sel:!!window.__TYPESET_SEL};
  });
  const ok = r.left===0 && errs.length===0;
  if(!ok) bad++;
  console.log('  ' + (ok?'✓':'✗') + ' ' + f.padEnd(38) + ' 公式块 ' + String(r.mjx).padStart(6) + '  未渲染 ' + String(r.left).padStart(4) + (errs.length?('  ERR: '+errs[0]):''));
  await p.close();
}
console.log('');
console.log('  失败页面数: ' + bad + ' / ' + pages.length);
if(!bad) console.log('  ✓ 25 页公式全部渲染完成，无源码裸露');
await b.close();
process.exit(bad?1:0);
