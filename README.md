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
| `sigmamumu-instagram-post-1080x1350.jpg` | Instagram portrait post, same board as the poster |
| `sigmamumu-ad-post-caption.md` | Caption copy — feed and sponsor-facing |

The animated cut of the Instagram board is rendered on demand — see
**Rendering the video** below.

`out/archive-first-direction/` holds an earlier, unrelated poster direction
(a p5.js detector-ring sketch, still in `poster/`) kept for reference.

## The design canvas (`design/`)

`design/Sigma Mu Mu Network.dc.html` is the live artboard set — **TABLOID** and
**INSTAGRAM** — authored in Claude Design and editable there.
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

## Rendering the stills

```sh
cd render && npm install                 # playwright-core
export CHROMIUM_PATH=/path/to/chrome     # optional, autodetected by the scripts
export FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")

# print master + PDF
node render/dcrender.mjs shot --file "design/Sigma Mu Mu Network.dc.html" \
     --screen TABLOID --scale 3 --settle 16000 \
     --out out/sigmamumu-poster-tabloid-3300x5100.png
python3 -m img2pdf out/sigmamumu-poster-tabloid-3300x5100.png \
     --pagesize 11inx17in -o out/sigmamumu-poster-tabloid-11x17.pdf

# Instagram portrait still (.jpg or .png, by extension)
node render/dcrender.mjs shot --file "design/Sigma Mu Mu Network.dc.html" \
     --screen INSTAGRAM --scale 1 --settle 22000 \
     --out out/sigmamumu-instagram-post-1080x1350.jpg
```

## Rendering the video

```sh
./render/render-video.sh                       # 14s, 1080x1350
./render/render-video.sh --fast                # quick preview, ink filters off
./render/render-video.sh --seconds 8 --fps 20  # shorter / cheaper
```

The script finds Chrome/Chromium and ffmpeg for you, installs the one npm
dependency, and writes `out/sigmamumu-instagram-post-1080x1350.mp4`.

**Why it is not instant.** The canvas ships an animation that a browser *draws
live*; there is no frame sequence in the package to collect. Each frame has to
be composed by the page and read back out. Two details make that slower than
you would expect:

- Capturing a frame takes far longer than a frame lasts, so the renderer
  freezes the page clock and steps it by hand — one captured second is one
  second of animation, at the cost of stepping serially.
- Chromium re-rasterises what it is asked to capture every single time. Under
  software rendering (a headless box with no GPU) a 1080×1350 sheet of large
  canvases and filtered layers costs seconds per frame; with a GPU it is far
  quicker. The renderer already hides the artboards it is not shooting, which
  roughly halves the work, and `--fast` drops the ink filters on top of that.

Profiled per frame on a headless, GPU-less box: page clock stepping **8 ms**,
screenshot **~3.4 s**. The screenshot is the whole cost, and it is the part
that gets dramatically better on a real machine.
