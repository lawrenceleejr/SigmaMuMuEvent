#!/usr/bin/env python3
"""Put the institutional marks on a common footing.

    python3 render/logos.py

The files in site/static/logos/original/ are as each institution publishes
them, and they do not sit together: each carries its own margin, and a bold
wordmark set to the same height as a stacked lockup with small type will
shout over it. This trims every mark to its own ink and then scales it so
they read at the same weight in a row.

The per-mark factors are judged by eye against the rendered row, not
calculated -- optical balance is not arithmetic. SLAC is a single heavy word
and comes down; the Tennessee lockup is mostly small type around one orange
square and comes up.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'site/static/logos/original', ROOT / 'site/static/logos/row'
HEIGHT, CANVAS = 150, 200          # 150px of ink on a 200px transparent canvas
WEIGHT = {'slac': 0.62, 'stanford-university-stacked': 1.0,
          'ut-knoxville-horizontal': 0.78, 'ut-knoxville-stacked': 1.0}

OUT.mkdir(parents=True, exist_ok=True)
for src in sorted(SRC.glob('*.png')):
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.getbbox())                     # its own ink, none of its margin
    h = HEIGHT * WEIGHT.get(src.stem, 1.0)
    scale = h / im.height
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (im.width, CANVAS), (0, 0, 0, 0))
    canvas.paste(im, (0, (CANVAS - im.height) // 2), im)
    canvas.save(OUT / src.name, optimize=True)
    print(f'{src.stem:32} {canvas.size[0]}x{canvas.size[1]}  {(OUT/src.name).stat().st_size/1024:.0f} KB')


# ---- reversed marks, for the dark skin -------------------------------------
# Only for the marks that are one colour, where "white version" has a single
# right answer: every opaque pixel becomes white and the antialiasing is
# carried by the alpha it already has. The Tennessee lockup is deliberately
# not here -- it is grey type beside an orange square holding a white T, and
# knocking that through is a design decision rather than a conversion. UT
# publishes an official "Reversed on Dark" file; take that one.
WHITE = ['slac', 'stanford-university-stacked']
WOUT = ROOT / 'site/static/logos/white'
WOUT.mkdir(parents=True, exist_ok=True)
for stem in WHITE:
    im = Image.open(SRC / f'{stem}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    r, g, b, a = im.split()
    white = Image.merge('RGBA', (a.point(lambda _: 255),) * 3 + (a,))
    h = HEIGHT * WEIGHT.get(stem, 1.0)
    scale = h / white.height
    white = white.resize((round(white.width * scale), round(white.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (white.width, CANVAS), (0, 0, 0, 0))
    canvas.paste(white, (0, (CANVAS - white.height) // 2), white)
    canvas.save(WOUT / f'{stem}.png', optimize=True)
    print(f'white/{stem:26} {canvas.size[0]}x{canvas.size[1]}  {(WOUT/f"{stem}.png").stat().st_size/1024:.0f} KB')

