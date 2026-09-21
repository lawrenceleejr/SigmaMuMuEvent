#!/usr/bin/env python3
"""The picture that appears when someone pastes a link to the site.

    python3 render/share-card.py

Slack, iMessage, WhatsApp, Bluesky and the rest read Open Graph tags. Without
an og:image they have nothing to show and fall back to a bare grey link, which
is what a paste of hepalumni.muoncollider.us looked like.

Open Graph wants 1200x630 (1.91:1); the banner is 2400x1000 (2.4:1). Rather
than crop the artwork -- which would cut the lockup or the date -- the banner
is scaled to the full width and set on its own cream, centred. The result
reads as a card rather than a crop, and nothing is lost.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CARDS = [
    # source banner,                      where it goes,                     ground
    ('out/sigmamumu-banner-light.png', 'site/static/img/share-card.jpg', (245, 240, 225)),
]
W, H = 1200, 630

for src_rel, dst_rel, ground in CARDS:
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
    print(f'{dst_rel}  {W}x{H}  {dst.stat().st_size/1024:.0f} KB')
