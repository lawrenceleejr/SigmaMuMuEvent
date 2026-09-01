# σμμ — A Physics × Industry Mixer

Artwork for **σμμ**, the US Muon Collider Collaboration's physics × industry
mixer — Sunday 13 December 2026, 4:30–6:30 p.m., Stanford campus.

The poster is a Feynman network printed letterpress-style: blue-noise vertices
triangulated into a planar mesh, thinned into fermion, boson and Higgs lines,
and grown outward from two seed points. Every stroke wanders slightly, wicks a
soft halo into the paper and pools where legs meet, so the sheet reads as
pressed rather than plotted.

## Deliverables (`out/`)

| File | Use |
|---|---|
| `sigmamumu-poster-tabloid-11x17.pdf` | Tabloid print master, 11 × 17 in at 300 dpi |
| `sigmamumu-poster-tabloid-3300x5100.png` | Same sheet as a flat PNG |
| `sigmamumu-instagram-post-1080x1350.mp4` | Animated 4:5 post — the network draws itself in over 14 s |
| `sigmamumu-ad-post-1080x1080.png` | Square advertisement post |
| `sigmamumu-ad-post-caption.md` | Caption copy for the ad, feed and sponsor-facing |

`out/archive-first-direction/` holds an earlier, unrelated poster direction
(a p5.js detector-ring sketch, still in `poster/`) kept for reference.

## The design canvas (`design/`)

`design/Sigma Mu Mu Network.dc.html` is the live artboard set — **TABLOID**,
**INSTAGRAM** and **AD** — authored in Claude Design and editable there.
`design/network.js` is the generator behind all three; the other two `.dc.html`
files are earlier explorations from the same canvas.

Fonts, the USMCC logo and the DC runtime's React build are vendored under
`design/assets/`, so a sheet renders identically with no network access.

Canvas controls (Claude Design's properties panel): `density`, `inkBite`
(paper texture), `inkBleed` (how far the ink wicks), `accent`, `animated`.

### House rules the generator enforces

These are checked, not eyeballed — run `node render/verify_network.mjs`:

- **at most four legs per vertex**
- **no two legs of one vertex closer than 30°**
- every component large enough to read as a diagram (no floating stubs)
- points confined to a rounded rectangle, so the corners of the sheet breathe

## Rendering

```sh
cd render && npm install                 # playwright-core
export CHROMIUM_PATH=/path/to/chrome     # optional
export FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")

# print master
node render/dcrender.mjs shot --file "design/Sigma Mu Mu Network.dc.html" \
     --screen TABLOID --scale 3 --settle 8000 \
     --out out/sigmamumu-poster-tabloid-3300x5100.png
python3 -m img2pdf out/sigmamumu-poster-tabloid-3300x5100.png \
     --pagesize 11inx17in -o out/sigmamumu-poster-tabloid-11x17.pdf

# animated post
node render/dcrender.mjs video --file "design/Sigma Mu Mu Network.dc.html" \
     --screen INSTAGRAM --scale 1 --fps 25 --seconds 14 --settle 6000 \
     --out out/sigmamumu-instagram-post-1080x1350.mp4

# advertisement post
node render/dcrender.mjs shot --file "design/Sigma Mu Mu Network.dc.html" \
     --screen AD --scale 1 --settle 8000 --out out/sigmamumu-ad-post-1080x1080.png
```

Capturing a frame takes far longer than a frame lasts, so video mode freezes the
page clock and steps it by hand — one captured second is one second of
animation. The sketch throttles its own redraw at ~34 ms, which is why the
video runs at 25 fps.
