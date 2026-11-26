# QA – srovnání originálu a kopie

Vyžaduje Node.js a Playwright (`npm i playwright && npx playwright install chromium`).

```bash
cd tools/qa
node compare.js            # všechny stránky × mobile/tablet/laptop/desktop
node compare.js mobile     # jen vybraná zařízení (čárkou oddělená)
node interact.js           # Lottie animace, video, slider, kotvy, lightbox, mobilní menu, formulář
```

`compare.js` pro každou stránku z `docs/` a každé zařízení porovná originál
(spravnymsmerem.czechdesign.cz) a kopii (corrivati.github.io/spravnym-smerem):
výšku stránky, počet a načtení obrázků, chybové požadavky (4xx/5xx), JS chyby,
externí hosty, fonty, texty a odkazy. Uloží celostránkové screenshoty
(`shots/<zařízení>_<orig|copy>_<stránka>.png`) a `results.json` pro porovnání po pixelech.
