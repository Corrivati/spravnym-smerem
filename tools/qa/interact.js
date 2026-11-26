const { chromium, devices } = require('playwright');
const SITES = { orig: 'https://spravnymsmerem.czechdesign.cz', copy: 'https://corrivati.github.io/spravnym-smerem' };
const u = (s, p) => s === 'orig' ? SITES.orig + (p === '/' ? '/' : p.replace(/\/$/, '')) : SITES.copy + p;
(async () => {
  const b = await chromium.launch();
  const R = {};
  for (const s of ['orig', 'copy']) {
    const r = R[s] = {};
    // ---- desktop home
    let ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); let pg = await ctx.newPage();
    await pg.goto(u(s, '/'), { waitUntil: 'networkidle' });
    await pg.waitForTimeout(2500);
    r.lottie = await pg.evaluate(() => [...document.querySelectorAll('dotlottie-player')].map(p => { const sr = p.shadowRoot; const el = sr && sr.querySelector('svg, canvas'); return !!el && (el.getBoundingClientRect().width > 0 || true) && (sr.querySelector('svg g') ? 'svg' : el ? el.tagName : 'none'); }));
    r.video = await pg.evaluate(async () => { const v = document.querySelector('video'); if (!v) return 'none'; v.scrollIntoView(); await new Promise(r => setTimeout(r, 1500)); return { ready: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(1), dur: +(v.duration || 0).toFixed(1) }; });
    // slider
    r.slider = await pg.evaluate(async () => {
      const el = document.querySelector('.gallery-slider-element'); if (!el) return 'none';
      el.scrollIntoView(); await new Promise(r => setTimeout(r, 800));
      const tr = () => { const w = el.querySelector('.swiper-wrapper, [class*="wrapper"]'); return w ? getComputedStyle(w).transform : 'nowrapper'; };
      const before = tr();
      const next = el.parentElement.querySelector('.swiper-button-next, [class*="next"]');
      if (!next) return { before, next: 'missing', classes: el.className };
      next.click(); await new Promise(r => setTimeout(r, 1200));
      return { moved: before !== tr(), init: el.className.includes('swiper') || !!el.querySelector('.swiper-wrapper') };
    });
    // anchor nav
    r.anchor = await pg.evaluate(async () => { const a = [...document.querySelectorAll('a')].find(a => /#faze-projektu/.test(a.getAttribute('href'))); if (!a) return 'none'; window.scrollTo(0, 0); a.click(); await new Promise(r => setTimeout(r, 1800)); const t = document.getElementById('faze-projektu'); return { href: a.getAttribute('href'), scrollY: Math.round(scrollY), targetTop: t ? Math.round(t.getBoundingClientRect().top) : 'notarget', url: location.pathname + location.hash }; });
    r.youtube = await pg.evaluate(() => document.querySelectorAll('iframe[src*="youtube"]').length);
    await ctx.close();
    // ---- galerie: lightbox button
    ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); pg = await ctx.newPage();
    await pg.goto(u(s, '/galerie/'), { waitUntil: 'networkidle' });
    const lbReqs = []; pg.on('response', x => { if (!/\.(png|jpe?g|webp|svg|woff2?|css|js|mjs)(\?|$)/.test(x.url())) lbReqs.push(x.status() + ' ' + x.url().replace(SITES[s], '')); });
    const btn = pg.locator('a.js-lightbox').first();
    if (await btn.count()) {
      await btn.scrollIntoViewIfNeeded(); await btn.click(); await pg.waitForTimeout(3000);
      r.lightboxBtn = await pg.evaluate(() => { const lb = [...document.querySelectorAll('body *')].find(e => /lightbox|modal|popup/i.test(e.className) && e.offsetHeight > 200 && getComputedStyle(e).position === 'fixed'); return { url: location.pathname, open: !!lb, cls: lb ? String(lb.className).slice(0, 60) : null, form: lb ? !!lb.querySelector('form') : !!document.querySelector('form') }; });
      r.lightboxReqs = lbReqs.slice(0, 5);
    } else r.lightboxBtn = 'no button';
    await ctx.close();
    // ---- mobile menu
    ctx = await b.newContext({ ...devices['iPhone 13'] }); pg = await ctx.newPage();
    await pg.goto(u(s, '/'), { waitUntil: 'networkidle' });
    await pg.locator('#nav-toggle').click(); await pg.waitForTimeout(1000);
    r.mobileMenu = await pg.evaluate(() => { const m = document.querySelector('#menu-main'); const rc = m.getBoundingClientRect(); return { expanded: document.querySelector('#nav-toggle').getAttribute('aria-expanded'), visible: rc.width > 0 && rc.right > 0 && rc.left < innerWidth, links: [...m.querySelectorAll('a')].map(a => a.textContent.trim()).join('|') }; });
    await pg.screenshot({ path: `menu_${s}.png` });
    // click "Výstava" in mobile menu
    await pg.locator('#menu-main a', { hasText: 'Výstava' }).first().click(); await pg.waitForLoadState('networkidle'); r.menuNav = new URL(pg.url()).pathname;
    await ctx.close();
    // ---- form page
    ctx = await b.newContext({ viewport: { width: 1366, height: 800 } }); pg = await ctx.newPage();
    const posts = []; pg.on('request', x => { if (x.method() === 'POST') posts.push(x.url()); });
    pg.on('response', x => { if (x.request().method() === 'POST') posts.push('-> ' + x.status()); });
    await pg.goto(u(s, '/formular/'), { waitUntil: 'networkidle' });
    r.form = await pg.evaluate(() => { const f = document.querySelector('form'); return f ? { action: f.getAttribute('action'), fields: [...f.querySelectorAll('input,textarea,select')].filter(i => i.type !== 'hidden').map(i => i.name || i.type).join(','), hidden: [...f.querySelectorAll('input[type=hidden]')].map(i => i.name).join(',') } : 'none'; });
    await ctx.close();
    console.log('=====', s, JSON.stringify(r, null, 1));
  }
  await b.close();
})();
