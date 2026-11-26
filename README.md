# Správným směrem – statická kopie webu

Statická HTML kopie webu <https://spravnymsmerem.czechdesign.cz/> (projekt CZECHDESIGN
o orientačních systémech v nemocnicích), převedená z CMS Solidpixels do čistého HTML,
které se spravuje v tomto repozitáři (např. přes Clauda) a publikuje přes GitHub Pages.

**Živý web:** <https://corrivati.github.io/spravnym-smerem/>

## Struktura

```
site/                     ← vše, co se publikuje
  index.html              ← úvodní stránka
  galerie/ formular/ v8/ vystava/
  blog/<slug>/index.html  ← články a mediální výstupy
  files/                  ← obrázky, videa, PDF (včetně responzivních variant files/responsive/<šířka>/0/…)
  assets/                 ← CSS a JS šablony (původně generované CMS)
  vendor/                 ← lokální kopie externích závislostí
    solidpixels/          ← ikonový font, masky a skripty z CDN Solidpixels
    lottie/               ← Lottie animace (.json)
    unpkg/                ← přehrávač dotlottie-player
    fonts/                ← písmo Manrope (Google Fonts)
  sitemap.xml, robots.txt
tools/mirror.py           ← skript, kterým kopie vznikla (lze spustit znovu)
.github/workflows/pages.yml ← automatický deploy na GitHub Pages
```

Všechny odkazy jsou **relativní**, takže web funguje na GitHub Pages
(`https://<účet>.github.io/spravnym-smerem/`) i na vlastní doméně.
Čisté URL (`/blog/nazev-clanku`) zůstávají zachované – každá stránka je `…/index.html`.

## Jak upravovat obsah

- Text článku: uprav `site/blog/<slug>/index.html` (obsah je v bloku `<main>`).
- Nový obrázek: nahraj do `site/files/` a odkaž relativně (např. `../../files/obrazek.jpg`).
- Nový článek: zkopíruj složku existujícího článku, přejmenuj, uprav obsah, přidej
  odkaz/kartu na úvodní stránku a záznam do `site/sitemap.xml`.
- Stačí napsat Claudovi, co změnit – úpravy udělá v souborech a pushne je.

Lokální náhled:

```bash
python3 -m http.server -d site 8000
```

## Publikace (GitHub Pages)

1. V repozitáři: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Po pushi do `main` se web automaticky nasadí (workflow `.github/workflows/pages.yml`).
3. Vlastní doména: **Settings → Pages → Custom domain** (vytvoří soubor `site/CNAME`)
   a u DNS nastav CNAME na `<účet>.github.io`.

## Co na statickém webu nefunguje

- **Formulář** (`/formular`) – původně ho zpracovával server Solidpixels. Na statickém
  webu je potřeba ho napojit na externí službu (např. Formspree, Basin, Google Forms)
  – stačí změnit atribut `action` u `<form>`.
- Měření (Google Tag Manager) zůstává ve stránkách tak, jak bylo na původním webu.

## Nové stažení z původního webu

```bash
python3 tools/mirror.py site
```

Skript projde `sitemap.xml` i všechny interní odkazy, stáhne soubory a přepíše
URL na relativní. Pozor: přepíše ruční úpravy ve složce `site/`.
