import puppeteer from 'puppeteer-core';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const PAGES = ['chapters/ch1.html','chapters/ch2.html','chapters/ch3.html','chapters/ch4.html','chapters/ch5.html',
  'chapters/ch6.html','chapters/ch7.html','chapters/ch8.html','chapters/ch9.html','chapters/ch10.html',
  'chapters/ch11.html','chapters/ch12.html','chapters/supp1.html','index.html','exam.html','cheatsheet.html'];
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'shell',
    args: ['--allow-file-access-from-files','--disable-gpu','--no-sandbox'] });
  let grand = 0;
  for (const rel of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('file://' + join(SITE, rel), { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    const H = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 800) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 14000));
    // 权威判据：整个页面的 visible innerText 里是否还有 LaTeX 分隔符
    const n = await page.evaluate(() => {
      const t = document.body.innerText || '';
      const m = t.match(/\$[^$\n]{1,120}\$/g) || [];
      return { count: m.length, samples: m.slice(0,3) };
    });
    grand += n.count;
    console.log('  ' + rel.replace('chapters/','').padEnd(16) + ' innerText 中的 $...$: ' + String(n.count).padStart(4) + (n.count ? ' ✗' : ' ✓'));
    n.samples.forEach(s => console.log('      ' + s.slice(0,60)));
    await page.close();
  }
  console.log('\n  合计: ' + grand);
  await browser.close();
})();
