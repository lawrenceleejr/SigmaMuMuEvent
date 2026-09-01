# σμμ — A Physics × Industry Mixer

Artwork for **σμμ**, the US Muon Collider Collaboration's physics × industry
mixer — Sunday 13 December 2026, 4:30–6:30 p.m., Stanford campus.

The poster is a Feynman network printed letterpress-style: blue-noise vertices
triangulated into a planar mesh, thinned into fermion, boson and Higgs lines,
and grown outward from two seed points. Nothing on the sheet is left crisp —
type, logo, QR and network all take the same ink treatment, so the whole page
reads as pressed rather than plotted.

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

### How the ink works

Bleed and pooling come from a filter stack rather than per-shape tricks. Each
inked layer is roughened against fractal noise, blurred, then thresholded on
alpha so the edge snaps back hard — shapes that come within a blur radius of
each other fuse, which is what pools the junctions and fills tight counters.
A wider, softer copy of the same alpha rides underneath as the wick into paper.

Three strengths, because one threshold cannot serve 560px and 11px type:

| Filter | Applied to |
|---|---|
| `#ink-type` | display type — the σμμ lockup, the headlines |
| `#ink-fine` | body copy, small caps, the logo, the QR |
| `#ink-line` | the network canvases, tuned so hairlines survive the threshold |

Paper texture (uneven inking, tooth and fibres) sits above everything on an
unfiltered multiply layer — that is paper, not ink.

### House rules the generator enforces

These are checked, not eyeballed — run `node render/verify_network.mjs`:

- **at most four legs per vertex**
- **no two legs of one vertex closer than 30°**
- every component large enough to read as a diagram (no floating stubs)
- points confined to a rounded rectangle whose radius wobbles around the arc,
  so the corner reads struck by hand — a small nick, with the mesh running
  right up into it

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
