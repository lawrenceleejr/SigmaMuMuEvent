#!/usr/bin/env python3
"""Make the event banners cheap enough for Indico to serve on a cold cache.

    python3 render/indico-banner.py

Two things about Indico's event logo decide what this has to do.

It re-encodes whatever you give it as a PNG: a 143 KB JPEG uploaded in March
came back out of the server as a 658 KB PNG of the same pixels. So the format
is not ours to choose, and the only lever is the entropy of the image itself.

And it serves the result through the application rather than off disk, beside
a 3.8 MB jquery/common bundle sent with Cache-Control: no-cache. On a cold
cache the browser asks for all of it at once, and the largest responses are
the ones that come back unfinished -- "cannot parse response" in Safari, and
then a page of ReferenceErrors because jQuery never arrived.

What costs the bytes is the field: several thousand hairlines at barely above
the ground, which no PNG predictor can do anything with. Folding the palest of
them back into the ground and quantising the rest takes the stored PNG from
658 KB to about 180. The bold lines, the dashes and the type are untouched;
what goes is the faintest layer of the pattern, which at the size a banner is
seen was texture rather than drawing.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'out'
WIDTH, FOLD, COLOURS = 1600, 18, 24
# the reunion page wears the cream skin, the meeting page the dark one
BANNERS = ['sigmamumu-banner-light', 'usmcc-2026-banner-dark']


def ground(a):
    """The most common colour in the image: its paper, whichever skin it is."""
    flat = a.reshape(-1, 3)
    colours, counts = np.unique(flat, axis=0, return_counts=True)
    return colours[counts.argmax()]


for name in BANNERS:
    src = OUT / f'{name}.png'
    if not src.exists():
        print(f'{name:32} missing -- run the banner render first')
        continue
    im = Image.open(src).convert('RGB')
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)

    a = np.asarray(im).astype(int)
    paper = ground(a)
    faint = np.abs(a - paper).sum(axis=2) < FOLD
    a[faint] = paper
    out = Image.fromarray(a.astype('uint8')).quantize(colors=COLOURS, dither=Image.NONE)

    dst = OUT / f'{name}-indico.png'
    out.save(dst, optimize=True)
    print(f'{name:32} {src.stat().st_size/1024:5.0f} KB -> {dst.stat().st_size/1024:5.0f} KB'
          f'  ({out.width}x{out.height}, {int(faint.mean()*100)}% of pixels folded into the ground)')
