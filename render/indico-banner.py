#!/usr/bin/env python3
"""Make the event banners small enough for Indico to serve on a cold cache.

    python3 render/indico-banner.py

The banners in out/ are 2400px PNGs of about 680 KB. Indico serves an event
logo through the application rather than from disk, so every visitor with an
empty cache pulls that whole file through a worker -- alongside the ~900 KB
jquery bundle, which the same server sends with Cache-Control: no-cache. The
two biggest responses on the page are the two that fail, which is what a
saturated worker pool looks like from the browser: "cannot parse response".

Indico shows the banner at about 1300px, so 1600 is already retina-ish for it.
The art is flat colour and fine line work, which is exactly the case where a
palette PNG stays large and a 4:4:4 JPEG does not: 143 KB against 680, at
39.6 dB, which at 2x magnification cannot be told from the PNG.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'out'
WIDTH, QUALITY = 1600, 84
BANNERS = ['sigmamumu-banner-light', 'usmcc-2026-banner-light']

for name in BANNERS:
    src = OUT / f'{name}.png'
    if not src.exists():
        print(f'{name:32} missing -- run the banner render first')
        continue
    im = Image.open(src).convert('RGB')
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dst = OUT / f'{name}-indico.jpg'
    # 4:4:4, because the red rules and the red type sit on cream and chroma
    # subsampling frays exactly those edges
    im.save(dst, quality=QUALITY, optimize=True, progressive=True, subsampling=0)
    print(f'{name:32} {src.stat().st_size/1024:5.0f} KB -> {dst.stat().st_size/1024:5.0f} KB'
          f'  ({im.width}x{im.height})')
