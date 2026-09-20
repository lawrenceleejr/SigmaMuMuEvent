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

args = [a for a in sys.argv[1:] if not a.startswith('--')] or [str(ROOT / 'photos-src')]
if '--banner' in sys.argv:
    args = []
srcs = []
for a in args:
    p = Path(a)
    srcs += sorted(p.glob('*.jpg')) if p.is_dir() else [p]
if args and len(srcs) != len(NAMES):
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


# ---- the group photograph, as a banner --------------------------------------
# The full frame is two thirds building. Cropped to the people it becomes a
# band about 3.6:1, which is the shape a mail banner wants anyway: wide enough
# to read as a crowd at 600px, short enough that it does not push the subject
# line's promise below the fold. The box is in fractions of the frame so it
# survives a re-scan or a bigger export of the same photograph.
GROUP_CROP = (0.030, 0.330, 0.925, 0.705)          # left, top, right, bottom

def group_banner(src):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    l, t, r, b = GROUP_CROP
    band = im.crop((round(l * w), round(t * h), round(r * w), round(b * h)))
    # 1024 wide: two device pixels for every CSS pixel of the mail's text
    # column, which is 512 -- the 600px sheet less its 44px side padding. The
    # banner is inset to that column rather than run to the sheet's edge, so
    # it lines up with the type above and below it.
    band = band.resize((1024, round(1024 * band.height / band.width)), Image.LANCZOS)
    dest = OUT / 'web' / 'usmcc-group-banner.jpg'
    band.save(dest, 'JPEG', quality=82, optimize=True, progressive=True, subsampling='4:2:0')
    print(f'{dest.relative_to(ROOT)}  {band.size[0]}x{band.size[1]}  {dest.stat().st_size/1024:.0f} KB')

    full = im.resize((2400, round(2400 * h / w)), Image.LANCZOS)
    dest = OUT / 'full' / 'usmcc-group-photo.jpg'
    full.save(dest, 'JPEG', quality=88, optimize=True, progressive=True, subsampling='4:4:4')
    print(f'{dest.relative_to(ROOT)}  {full.size[0]}x{full.size[1]}  {dest.stat().st_size/1024:.0f} KB')

if __name__ == '__main__' and '--banner' in sys.argv:
    group_banner(sys.argv[sys.argv.index('--banner') + 1])
