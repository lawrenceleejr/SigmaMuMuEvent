#!/usr/bin/env python3
"""Make the meeting photographs web-sized.

    python3 render/photos.py <source-dir-or-files>

Two sizes come out of each photograph, into site/static/photos/:

  web/   1200px on the long edge, quality 80 -- what goes in an Indico page
         or an email. Big enough to fill a column on a retina screen at the
         size these are actually displayed, small enough that a page with
         three of them is still a fast page.
  full/  2400px, quality 88 -- the copy to link to when someone wants to look
         properly, or to hand to a designer.

Both are saved progressive (a progressive JPEG shows a whole rough image
early rather than a sharp band creeping down the page) and with 4:4:4 chroma
at the larger size, because poster text and lanyard lettering are exactly
what 4:2:0 smears.

Metadata is dropped rather than copied. Camera files carry the time, the body
and often the GPS position of the room; none of that belongs on a public
server, and it is a few KB besides.
"""
import sys, os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'site' / 'static' / 'photos'
# The names are the deliverable: a URL is read by people, and
# "usmcc-poster-session-1.jpg" says what it is where "IMG_4821.jpg" does not.
NAMES = ['usmcc-poster-session-1', 'usmcc-poster-session-2', 'usmcc-poster-session-3']
SIZES = {'web': (1200, 80, '4:2:0'), 'full': (2400, 88, '4:4:4')}

args = sys.argv[1:] or [str(ROOT / 'photos-src')]
srcs = []
for a in args:
    p = Path(a)
    srcs += sorted(p.glob('*.jpg')) if p.is_dir() else [p]
if len(srcs) != len(NAMES):
    sys.exit(f'expected {len(NAMES)} photographs, got {len(srcs)}')

for src, name in zip(srcs, NAMES):
    im = Image.open(src).convert('RGB')
    for kind, (edge, q, subsampling) in SIZES.items():
        w, h = im.size
        scale = edge / max(w, h)
        out_im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS) if scale < 1 else im
        dest = OUT / kind / f'{name}.jpg'
        dest.parent.mkdir(parents=True, exist_ok=True)
        out_im.save(dest, 'JPEG', quality=q, optimize=True, progressive=True,
                    subsampling=subsampling)
        print(f'{dest.relative_to(ROOT)}  {out_im.size[0]}x{out_im.size[1]}  '
              f'{dest.stat().st_size/1024:.0f} KB')
