#!/usr/bin/env python3
"""
Stáhne kompletní statickou kopii webu https://spravnymsmerem.czechdesign.cz
do složky ./site (nebo jiné předané jako argument).

- Projde všechny URL ze sitemap.xml + všechny interní odkazy nalezené na stránkách.
- Stáhne obrázky (/files), CSS/JS (/assets), ikonový font a masky ze CDN Solidpixels,
  Lottie animace, přehrávač Lottie (unpkg) a font Manrope (Google Fonts).
- Všechny odkazy přepíše na relativní cesty, takže web funguje na GitHub Pages
  (i v podsložce /spravnym-smerem/) i na vlastní doméně.

Použití:  python3 tools/mirror.py [výstupní_složka]
"""
import os
import re
import hashlib
import sys
import time
import posixpath
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

HOST = "spravnymsmerem.czechdesign.cz"
BASE = f"https://{HOST}"
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Externí hosty, jejichž soubory si stáhneme lokálně -> prefix ve výstupu
VENDOR = {
    "cdn.solidpixels.com": "vendor/solidpixels",
    "lottie.host": "vendor/lottie",
    "unpkg.com": "vendor/unpkg",
    "fonts.gstatic.com": "vendor/fonts",
}

cache = {}


def fetch(url, binary=True):
    if url in cache:
        return cache[url]
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                final = r.geturl()
            cache[url] = (data, final)
            return data, final
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"  404 {url}")
                cache[url] = (None, url)
                return None, url
            err = e
        except Exception as e:  # noqa
            err = e
        time.sleep(2 ** attempt)
    print(f"  FAIL {url}: {err}")
    cache[url] = (None, url)
    return None, url


def write(rel, data):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if isinstance(data, bytes) else "w"
    with open(path, mode, **({} if mode == "wb" else {"encoding": "utf-8"})) as f:
        f.write(data)


def relpath(target, from_file):
    """Relativní cesta z umístění souboru from_file (relativní k OUT) na target."""
    from_dir = posixpath.dirname(from_file) or "."
    r = posixpath.relpath(target, from_dir)
    return r


# ---------------------------------------------------------------- mapování URL

def is_page_path(path):
    return not (path.startswith("/files/") or path.startswith("/assets/")
                or path.startswith("/cms") or re.search(r"\.[a-z0-9]{2,5}$", path, re.I))


def page_file(path):
    """/blog/x -> blog/x/index.html ; / -> index.html"""
    path = path.strip("/")
    return f"{path}/index.html" if path else "index.html"


def asset_local(url):
    """Vrátí lokální cestu (relativní k OUT) pro URL assetu, nebo None."""
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(p.path)
    if p.netloc == HOST:
        local = path.lstrip("/")
    elif p.netloc in VENDOR:
        local = VENDOR[p.netloc] + path
    else:
        return None
    if p.query:
        stem, ext = posixpath.splitext(local)
        local = f"{stem}-{hashlib.md5(p.query.encode()).hexdigest()[:8]}{ext}"
    return local


downloaded_assets = {}  # url -> local


def get_asset(url):
    """Stáhne asset (a jeho závislosti) a vrátí lokální cestu nebo None."""
    url = url.split("#")[0]
    if url in downloaded_assets:
        return downloaded_assets[url]
    local = asset_local(url)
    if not local:
        return None
    downloaded_assets[url] = local  # zabrání zacyklení
    is_text = local.endswith((".css", ".mjs")) or urllib.parse.urlsplit(url).netloc == "unpkg.com"
    if not is_text and os.path.exists(os.path.join(OUT, local)):
        return local  # už staženo dříve
    data, final = fetch(url)
    if final != url and urllib.parse.urlsplit(final).netloc in VENDOR:
        local = asset_local(final)  # např. unpkg @latest -> konkrétní verze
        downloaded_assets[url] = local
    if data is None:
        downloaded_assets[url] = None
        return None
    if local.endswith(".css"):
        data = process_css(data.decode("utf-8", "replace"), final, local).encode("utf-8")
    elif local.endswith(".mjs") or urllib.parse.urlsplit(url).netloc == "unpkg.com":
        data = process_module(data.decode("utf-8", "replace"), final, local).encode("utf-8")
    write(local, data)
    return local


CSS_URL = re.compile(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)")


def process_css(css, css_url, css_local):
    def repl(m):
        u = m.group(2).strip()
        if u.startswith("data:") or u.startswith("#"):
            return m.group(0)
        frag = ""
        if "#" in u:
            u, frag = u.split("#", 1)
            frag = "#" + frag
        absu = urllib.parse.urljoin(css_url, u)
        loc = get_asset(absu)
        if not loc:
            return m.group(0)
        return f"url({m.group(1)}{relpath(loc, css_local)}{frag}{m.group(1)})"
    css = CSS_URL.sub(repl, css)
    # @import "..."
    css = re.sub(r"@import\s+(['\"])([^'\"]+)\1",
                 lambda m: f"@import {m.group(1)}{relpath(get_asset(urllib.parse.urljoin(css_url, m.group(2))) or m.group(2), css_local)}{m.group(1)}",
                 css)
    return css


def process_module(js, js_url, js_local):
    """Stáhne relativní ES importy (pro přehrávač Lottie z unpkg)."""
    for m in re.finditer(r"(?:from|import)\s*\(?\s*['\"](\.{1,2}/[^'\"]+)['\"]", js):
        get_asset(urllib.parse.urljoin(js_url, m.group(1)))
    return js


# ------------------------------------------------------------- Google Fonts

def localize_google_fonts(css_url):
    data, final = fetch(css_url)
    if data is None:
        return None
    local = "vendor/fonts/fonts.css"
    css = process_css(data.decode("utf-8"), final, local)
    write(local, css)
    return local


# ------------------------------------------------------------------ stránky

URL_IN_HTML = re.compile(
    r"https?:(?:\\?/){2}(?:" + "|".join(re.escape(h) for h in [HOST, *VENDOR, "fonts.googleapis.com"]) +
    r")[^\s\"'<>)\]]*")


def rewrite_html(html, page_local, queue):
    # unpkg @latest -> pevná verze (stáhne se přes redirect)
    def repl(m):
        raw = m.group(0)
        escaped = "\\/" in raw
        u = raw.replace("\\/", "/")
        # odříznout koncovou čárku/entity ze srcset apod.
        trail = ""
        while u and u[-1] in ",;":
            trail = u[-1] + trail
            u = u[:-1]
        u = u.replace("&amp;", "&")
        p = urllib.parse.urlsplit(u)
        if p.netloc == "fonts.googleapis.com":
            if "css" in p.path:
                loc = localize_google_fonts(u)
                return (relpath(loc, page_local) if loc else raw) + trail
            return raw  # preconnect apod.
        if p.netloc == HOST and is_page_path(p.path or "/"):
            if p.path.startswith("/cms") or escaped:
                return raw  # konfigurace CMS v JSON – nechat
            target = page_file(p.path or "/")
            queue.add("/" + p.path.strip("/") if p.path.strip("/") else "/")
            r = relpath(posixpath.dirname(target) or ".", page_local)
            r = (r + "/") if r != "." else "./"
            if p.query:
                r += "?" + p.query
            if p.fragment:
                r += "#" + p.fragment
            return r + trail
        loc = get_asset(u)
        if not loc:
            return raw
        r = relpath(loc, page_local)
        if p.fragment:
            r += "#" + p.fragment
        return r + trail
    return URL_IN_HTML.sub(repl, html)


SITEMAP_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sitemap.xml")


def sitemap_paths():
    data, _ = fetch(BASE + "/sitemap.xml")
    if data is None and os.path.exists(SITEMAP_LOCAL):
        # živý web sitemapu nevrací -> použijeme uloženou tools/sitemap.xml
        data = open(SITEMAP_LOCAL, "rb").read()
    paths = set()
    if data:
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        for loc in ET.fromstring(data).findall(".//s:loc", ns):
            p = urllib.parse.urlsplit(loc.text.strip()).path or "/"
            paths.add("/" + p.strip("/") if p.strip("/") else "/")
    return paths


def main():
    os.makedirs(OUT, exist_ok=True)
    queue = sitemap_paths() | {"/"}
    done = set()
    while queue - done:
        path = sorted(queue - done)[0]
        done.add(path)
        url = BASE + (path if path != "/" else "/")
        print(f"PAGE {path}")
        data, final = fetch(url)
        if data is None:
            continue
        fp = urllib.parse.urlsplit(final)
        if fp.netloc != HOST:
            print(f"  redirect mimo web: {final}")
            continue
        html = data.decode("utf-8", "replace")
        local = page_file(path)
        found = set()
        html = rewrite_html(html, local, found)
        queue |= {p for p in found if p not in done}
        write(local, html)

    # sitemap + robots
    sm, _ = fetch(BASE + "/sitemap.xml")
    if sm is None and os.path.exists(SITEMAP_LOCAL):
        sm = open(SITEMAP_LOCAL, "rb").read()
    if sm:
        write("sitemap.xml", sm)
    rb, _ = fetch(BASE + "/robots.txt")
    if rb:
        write("robots.txt", rb)
    print(f"\nHotovo: {len(done)} stránek, {sum(1 for v in downloaded_assets.values() if v)} souborů.")
    missing = [u for u, v in downloaded_assets.items() if v is None]
    if missing:
        print("Nestaženo:", *missing, sep="\n  ")


if __name__ == "__main__":
    main()
