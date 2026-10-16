#!/usr/bin/env python3
"""The banner artwork fitted to frames other people's systems ask for.

    python3 render/share-card.py

Slack, iMessage, WhatsApp, Bluesky and the rest read Open Graph tags. Without
an og:image they have nothing to show and fall back to a bare grey link, which
is what a paste of hepalumni.muoncollider.us looked like.

Every frame asked for so far is near 1.9:1 -- Open Graph wants 1200x630, event
listings ask for their own sizes -- while the banner is 2400x1000, or 2.4:1.
Rather than crop the artwork, which would cut either the lockup or the date,
it is scaled to the full width and centred on its own ground. The result reads
as a card rather than a crop, and nothing is lost.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PAPER, SOOT = (245, 240, 225), (20, 19, 18)
CARDS = [
    # source banner,                   where it goes,                       size,  ground
    ('out/sigmamumu-banner-light.png', 'site/static/img/share-card.jpg', (1200, 630), PAPER),
    ('out/sigmamumu-banner-light.png', 'out/sigmamumu-listing-1352x698.jpg', (1352, 698), PAPER),
    ('out/usmcc-2026-banner-dark.png', 'out/usmcc-2026-listing-1352x698.jpg', (1352, 698), SOOT),
]

for src_rel, dst_rel, (W, H), ground in CARDS:
    src = ROOT / src_rel
    if not src.exists():
        print(f'{src_rel}: missing -- run the banner render first')
        continue
    art = Image.open(src).convert('RGB')
    art = art.resize((W, round(art.height * W / art.width)), Image.LANCZOS)

    card = Image.new('RGB', (W, H), ground)
    card.paste(art, (0, (H - art.height) // 2))

    dst = ROOT / dst_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    # JPEG at 4:4:4: the card is fetched by every app that sees the link, and
    # a palette PNG of this artwork is four times the size for no visible gain.
    # No subsampling, because the red rules and red type sit on cream and that
    # is exactly the edge chroma subsampling frays.
    card.save(dst, quality=88, optimize=True, progressive=True, subsampling=0)
    print(f'{dst_rel:42} {W}x{H}  {dst.stat().st_size/1024:5.0f} KB'
          f'  (art {art.height}px tall, {(H - art.height) // 2}px of ground above and below)')
