# σμμ — A Particle Physics Alumni Reunion

Artwork for **σμμ**, the US Muon Collider Collaboration's particle physics alumni
reunion — Sunday 13 December 2026, 4:30–6:30 p.m., Stanford campus.

The poster is a Feynman network drawn clean: blue-noise vertices triangulated
into a planar mesh, thinned into fermion, boson and Higgs lines, and grown
outward from two seed points. Straight propagators, drawn waves for the bosons,
dashes for the scalars, a filled node at every junction and an × wherever a line
ends in the vacuum. Every line is exactly the weight it says it is.

## Deliverables (`out/`)

| File | Use |
|---|---|
| `sigmamumu-poster-tabloid-11x17.pdf` | Tabloid print master, 11 × 17 in at 300 dpi |
| `sigmamumu-poster-tabloid-3300x5100.png` | Same sheet as a flat PNG |
| `sigmamumu-instagram-post-2160x2700.jpg` | Instagram portrait master at 2× — use this for viewing and zooming |
| `sigmamumu-instagram-post-1080x1350.jpg` | Same board at Instagram's exact upload size |
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

The sheet is cream (`--color-bg: #f5f0e1` in the design system) with
`design/paper-grain.png` laid over the whole board on a multiply layer at 62%
— mottling, fibres and creases, so the ground reads as stock rather than a
flat fill. That texture shipped in the original canvas export and was never
wired up; using it avoids sourcing one with unclear licensing.

Canvas controls (Claude Design's properties panel): `density`, `accent`,
`animated`, and `inkBite` — a procedural speckle pass, off by default and
largely superseded by the paper overlay.

### Every vertex is a real Standard Model vertex

`node render/audit_vertices.mjs` classifies every vertex by the multiset of
line styles meeting at it, and fails if any is not an SM interaction. The
legal list is **ffV**, **ffh**, **VVV**, **VVVV**, **hVV**, **hhVV**, **hhh**,
**hhhh**. Two rules do most of the work:

- a fermion line is continuous, so a vertex carries 0 or 2 fermion legs, never
  an odd number — no `fff`, no line stopping mid-diagram;
- the SM has no tree-level 4-point vertex involving fermions, so a fermion pair
  only ever meets one boson. Fermion lines therefore run through three-legged
  vertices only, which is why the mesh is biased trivalent.

**hhV is excluded on purpose.** For two identical neutral scalars it vanishes —
the h∂h current is antisymmetric under swapping the legs, so hhZ and hhγ are
zero. It exists only for *distinct* scalars (γH⁺H⁻, ZhG⁰, ZhA), which a single
dash style cannot express, so the generator never produces it.

**Getting enough fermion line into the picture takes some work.** A fermion
pair only meets one boson, so fermion lines need three-legged vertices — and a
mesh full of four-legged ones leaves them nowhere to run. Deleting a leg to
force trivalence cuts the mesh apart, so instead every four-legged vertex is
**split** into two three-legged ones: its legs are dealt out two and two across
the widest pair of gaps between them, joined by a short new edge. Nothing is
disconnected and the sheet gets denser.

On a three-legged vertex, hosting a fermion pair means choosing which single
leg is *not* fermion — so choosing one leg per vertex, no vertex twice, is a
**matching**, and every edge outside it is free to be fermion. The generator
takes a greedy matching, improves it with short augmenting paths, then pairs
off whatever it missed by walking the shortest route through the mesh and
flipping edges along it. How much of the sheet carries fermion line is set by
standing a share of vertices down before any of that (`fermionOptOut`), which
is what balances solid against wavy.

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
     --screen INSTAGRAM --scale 2 --settle 26000 \
     --out out/sigmamumu-instagram-post-2160x2700.jpg
$FFMPEG -y -i out/sigmamumu-instagram-post-2160x2700.jpg \
     -vf scale=1080:1350:flags=lanczos -q:v 2 -pix_fmt yuvj444p \
     out/sigmamumu-instagram-post-1080x1350.jpg
```

`--scale` is the whole resolution story: the artboards are laid out in CSS
pixels (1100 × 1700 and 1080 × 1350) and `--scale N` renders them at N times
that. The canvases inside the design follow the same ratio, so a 3× capture is
genuinely 3× of line art rather than an upscale of something smaller.

## Rendering the video

```sh
./render/render-video.sh                       # 14s, 1080x1350, 60fps
./render/render-video.sh --fps 30              # half the frames, half the wait
./render/render-video.sh --scale 2             # 2160x2700 instead of 1080x1350
```

The sketch draws at up to 60 Hz (it redraws no more often than every 15 ms), so
60 fps capture yields a distinct frame every time — verified, no repeats. Frame
count is what costs you wall-clock: 14 s at 60 fps is 840 screenshots, so drop
`--fps` when you just want to check timing.

The script finds Chrome/Chromium and ffmpeg for you, installs the one npm
dependency, and writes `out/sigmamumu-instagram-post-1080x1350.mp4`.

**Why it is not instant.** The canvas ships an animation that a browser *draws
live*; there is no frame sequence in the package to collect. Each frame has to
be composed by the page and read back out. Two details make that slower than
you would expect:

- Capturing a frame takes far longer than a frame lasts, so the renderer
  freezes the page clock and steps it by hand — one captured second is one
  second of animation, at the cost of stepping serially, one frame at a time.
- Chromium re-rasterises what it is asked to capture every single time. Under
  software rendering (a headless box with no GPU) a 1080×1350 sheet of large
  canvases and filtered layers costs seconds per frame; with a GPU it is far
  quicker. The renderer hides the artboards it is not shooting, which roughly
  halves the work.

Profiled per frame on a headless, GPU-less box: page clock stepping **8 ms**,
screenshot **~3.4 s**. The screenshot is the whole cost, and it is the part
that gets dramatically better on a real machine.
