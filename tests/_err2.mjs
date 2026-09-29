import puppeteer from 'puppeteer-core';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'shell',
    args: ['--allow-file-access-from-files','--disable-gpu','--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  STACK:', (e.stack||'').split('\n').slice(0,5).map(s=>s.trim()).join('  ⟶  ').slice(0,400)));
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto('file://' + join(SITE, 'linear-algebra.html'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
