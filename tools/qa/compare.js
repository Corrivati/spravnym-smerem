const { chromium, devices } = require('playwright');
const fs = require('fs');
const ORIG = 'https://spravnymsmerem.czechdesign.cz', COPY = 'https://corrivati.github.io/spravnym-smerem';
// všechny stránky = všechny index.html ve složce docs/
const path = require('path');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const pages = (function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === 'index.html' ? ['/' + path.relative(DOCS, dir).split(path.sep).join('/') + '/'] : []);
})(DOCS).map(p => p.replace('//', '/')).sort();
process.chdir(__dirname);
const DEV = {
  mobile: { ...devices['iPhone 13'] },
  tablet: { ...devices['iPad Mini'] },
  laptop: { viewport: { width: 1366, height: 768 } },
  desktop: { viewport: { width: 1920, height: 1080 } },
};
const only = process.argv[2] ? process.argv[2].split(',') : null;
fs.mkdirSync('shots', { recursive: true });
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
dotlottie-player,video,iframe{visibility:hidden!important}`;
async function run(browser, dev, site, path) {
  const ctx = await browser.newContext({ ...DEV[dev], deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const res = { failed: [], jserr: [], external: new Set() };
  const host = site === 'orig' ? 'spravnymsmerem.czechdesign.cz' : 'corrivati.github.io';
  pg.on('response', r => { if (r.status() >= 400) res.failed.push(r.status() + ' ' + r.url()); });
  pg.on('requestfailed', r => { if (!/googletagmanager|google-analytics|youtube|ytimg|doubleclick|ggpht/.test(r.url())) res.failed.push('ERR ' + r.failure()?.errorText + ' ' + r.url()); });
  pg.on('request', r => { const h = new URL(r.url()).hostname; if (h && h !== host) res.external.add(h); });
  pg.on('pageerror', e => res.jserr.push(e.message.slice(0, 120)));
  const url = (site === 'orig' ? ORIG + (path === '/' ? '/' : path.replace(/\/$/, '')) : COPY + path);
  try { await pg.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); } catch (e) { res.failed.push('GOTO ' + e.message.slice(0, 80)); }
  await pg.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } window.scrollTo(0, 0); });
  await pg.waitForLoadState('networkidle').catch(() => {});
  await pg.waitForTimeout(1200);
  await pg.addStyleTag({ content: FREEZE });
  // hide cookie bar for a fair comparison
  await pg.evaluate(() => document.querySelectorAll('[class*="cookie"]').forEach(e => { if (e.offsetHeight && getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }));
  await pg.waitForTimeout(300);
  Object.assign(res, await pg.evaluate(() => {
    const imgs = [...document.images];
    const vis = imgs.filter(i => i.getBoundingClientRect().width > 0);
    const name = u => (u || '').split('/').slice(-4).join('/').split('?')[0];
    return {
      height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth,
      vw: window.innerWidth, title: document.title,
      imgs: vis.length,
      broken: vis.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).map(i => name(i.currentSrc || i.src)),
      unloaded: vis.filter(i => !i.currentSrc && !i.src).length,
      srcs: vis.map(i => name(i.currentSrc || i.src)),
      bg: [...document.querySelectorAll('[style*="background-image"]')].length,
      links: [...document.querySelectorAll('a[href]')].length,
      text: document.body.innerText.replace(/\s+/g, ' ').length,
      fontOk: document.fonts.check('16px Manrope'),
      icons: document.fonts.check('16px solid-icons'),
    };
  }));
  const file = `shots/${dev}_${site}_${(path.replace(/\W+/g, '_').slice(0, 60) || 'home')}.png`;
  await pg.screenshot({ path: file, fullPage: true }).catch(e => res.failed.push('SHOT ' + e.message.slice(0, 60)));
  res.shot = file; res.external = [...res.external];
  await ctx.close();
  return res;
}
(async () => {
  const browser = await chromium.launch();
  const jobs = [];
  for (const p of pages) for (const d of Object.keys(DEV)) if (!only || only.includes(d)) jobs.push([p, d]);
  const out = {};
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const [p, d] = jobs[i++];
      const [o, c] = await Promise.all([run(browser, d, 'orig', p), run(browser, d, 'copy', p)]);
      out[p + '|' + d] = { orig: o, copy: c };
      console.log(`${d.padEnd(7)} ${p.slice(0, 60).padEnd(60)} h ${o.height}/${c.height} img ${o.imgs}/${c.imgs} broken ${o.broken.length}/${c.broken.length} fail ${o.failed.length}/${c.failed.length}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  fs.writeFileSync('results.json', JSON.stringify(out, null, 1));
  await browser.close();
})();
