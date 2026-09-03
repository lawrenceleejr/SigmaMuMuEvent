# σμμ — A Particle Physics Alumni Reunion

Artwork for **σμμ**, the US Muon Collider Collaboration's particle physics alumni
reunion — Sunday 13 December 2026, 4:30–6:30 p.m., Stanford University.

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
| `slide-bg-{dark,light}-{1920x1080,3840x2160}.png` | 16:9 slide backgrounds |

The animated cut of the Instagram board is rendered on demand — see
**Rendering the video** below.

### The presenter screen

`/bg` is a page to put up on the room screen during a break: the same field,
animated, with the VBF diagram held still in the middle and the banner's
information over it. Nothing on the site links to it and it stays out of the
sitemap — it is a screen, not a page.

Two controls sit in a bar along the bottom. A text field puts an announcement
on the screen, sized to fit the band it is given, so **Back at 10:45** fills it
and a whole sentence steps down until it fits. A button presents: the bar goes,
and a tap, a click or Esc brings it back.

#### Music

The same press that goes full screen can start an Apple Music playlist,
shuffled. Both parameters in `site/content/bg.md` are blank, and while they
are blank nothing is loaded, no button appears and the page is exactly what it
was:

    params:
      music_token: ""      # a MusicKit developer token
      music_playlist: ""   # pl.xxxxxxxx, out of the playlist's share link

The plain `embed.music.apple.com` iframe cannot do this — it has no shuffle,
and being cross-origin it cannot be told to start from outside, somebody has
to press play inside it. MusicKit can do both and wants a developer token in
exchange: a JWT signed with a MusicKit private key from an Apple Developer
account, good for up to six months. It is not a secret the way a password is
— it ships in the page, which is how MusicKit works — but it is tied to that
account, so give it the shortest life you can live with.

Two things to know before leaning on it in a room. Full-length playback needs
whoever is at the machine to be signed in to an Apple Music subscription;
MusicKit asks on the first press, and without a subscription Apple serves
previews or refuses. And you can get that sign-in out of the way before the
room fills by pressing **Music** in the bar once — it authorizes without
starting anything.

Everything fails quietly: a bad token, a refused sign-in, or Apple's CDN being
unreachable all leave the screen exactly as it was.

Presenting is the page's own state, not the Fullscreen API's. iPhone Safari has
no Fullscreen API — not on the document element, not prefixed — so a mode that
waits for `requestFullscreen` never starts there and the controls stay on
screen. The chrome goes on a class either way, and real full screen is asked
for on top of that where it exists. Added to a phone's home screen the page
runs without the browser's bars, which is as close as an iPhone gets.

The diagram and its grown legs are painted once onto their own canvas and left
alone; only the generated mesh animates, and it animates on the website's
rules — one or two walkers flooding it from a single vertex each, a
direction-biased Dijkstra so the front travels rather than spreading as a
disc, and a line starting to draw only when the flood reaches it, out of the
vertex it arrived at. Giving every line its own looping clock instead, which
this page did first, bunches them up: the whole field re-emerges at once.
Lines are batched by tone and type into one path each, and if
the frames still come back slow — a 4K panel driven without acceleration is
the case that bites — the canvas steps its resolution down rather than
stutter. The field is reseeded on every load, so it is never quite the same
screen twice.

Held in portrait the masthead re-sets itself: the type takes a larger share of
the width, the footline stacks on the left edge under the rule, and the
diagram — ten and a half units across, so a tall frame is limited by its width
— shrinks to fit and drops clear of the type.

### The slide background

`node render/slide-bg.mjs` puts a vector-boson-fusion diagram in the middle of
the field — two quarks come in, each radiates a weak boson, the bosons fuse to
a Higgs, and that Higgs splits into the pair — and grows the rest of the
picture out of its six external legs, one legal vertex at a time: a fermion
carries on and radiates a boson or a Higgs, a boson splits or turns into a
Higgs, a Higgs splits or goes back to bosons. Nothing is placed that would
cross what is already there, and the generated mesh fills what is left, held
off the drawn structure by a clearance along every segment. Both graphs are
audited against the same table as everything else; the render fails on an
illegal vertex.

    node render/slide-bg.mjs --theme light          # cream instead of near-black
    node render/slide-bg.mjs --w 3840 --h 2160      # same picture, larger
    node render/slide-bg.mjs --seed 12              # a different field
    node render/slide-bg.mjs --veil 0.5             # knocked back, for slides
                                                    # that carry a lot of type

`out/archive-first-direction/` holds an earlier, unrelated poster direction
(a p5.js detector-ring sketch, still in `poster/`) kept for reference.

## The website (`site/`)

A Hugo site that wears the same identity as the poster — same stock colour,
ink, accent, faces, paper texture, and the **same generator**: `design/network.js`
is copied to `site/static/js/network.js`, and CI diffs the two so they cannot
drift apart.

```sh
cd site
./run.sh serve      # Docker, live reload on :1313
./run.sh build      # to site/public
FORCE_HOST=1 ./run.sh build    # if hugo extended is on your PATH
```

**Content is Markdown.** `site/content/_index.md` holds the prose; the
structured bits — program rows, the `if` / `&&` questions, date and venue —
are front matter in the same file. Editing that one file is the whole job for
ordinary copy changes; the layout lives in `site/layouts/`.

### The background

The field is the poster's mesh, animated. `site/static/js/field.js`:

- **A direction-biased flood.** A plain Dijkstra from a seed spreads as a disc.
  Multiplying each edge's cost by how far it points from a *drifting* preferred
  heading makes the front travel instead — cheap along the heading, expensive
  across it — so it wanders across the field.
- **Head and tail.** Every edge gets an arrival distance. A frame draws only the
  edges arriving inside `(head - tail, head]`, part-grown at the head and fading
  out at the tail. The result is a blob that propagates rather than expands.
- **Scroll owns the tail.** `TAIL_TOP` (0.18 of the flood) to `TAIL_BOTTOM`
  (1.3 — longer than the flood itself, so nothing dissolves). By the bottom of
  the page the whole field is lit.
- **Two walkers, out of phase**, so one is always mid-life while the other
  re-seeds and the background never empties.
- **`SCALE` is the legibility dial.** It zooms the diagram geometry —
  wavelengths, dash lengths, node radii, line weights — along with the point
  spacing. That is what keeps the linework readable *as physics* through the
  15px `backdrop-filter` blur; shrinking the mesh instead just makes grey fuzz.

The canvas is `position: fixed` and full-window. The content panes scroll over
it and frost what they pass. There is an opaque fallback for browsers without
`backdrop-filter`, and `prefers-reduced-motion` settles the field and holds it.

### Deploying

`.github/workflows/pages.yml` builds `site/` on every push and PR — running
the network checks and the generator diff first — and deploys to GitHub Pages
**only from `main`**.

One repo setting has to be done by hand, once: **Settings → Pages → Source:
GitHub Actions**. Until this branch is merged to `main`, pushes build as a
check but publish nothing.

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
legal list is **ffV**, **ffh**, **ffVV**, **VVV**, **VVVV**, **hVV**, **hhVV**,
**hhh**, **hhhh**. One rule does most of the work: a fermion line is
continuous, so a vertex carries 0 or 2 fermion legs, never an odd number — no
`fff`, no line stopping mid-diagram, and never four at one vertex.

**ffVV is included at the client's request and is not a tree-level SM vertex** —
the SM Lagrangian has no such term, the seagull belongs to scalar QED — but it
is a familiar contact term in HEFT and other effective descriptions. It earns
its place structurally too: with a fermion pair able to sit on a four-legged
vertex, the mesh no longer has to be forced trivalent to carry fermion line,
which is what was stranding loose ends all over the sheet.

**hhV is excluded on purpose.** For two identical neutral scalars it vanishes —
the h∂h current is antisymmetric under swapping the legs, so hhZ and hhγ are
zero. It exists only for *distinct* scalars (γH⁺H⁻, ZhG⁰, ZhA), which a single
dash style cannot express, so the generator never produces it.

**Order matters.** Scalars go down first — pure Higgs vertices (`hhhh` from a
four-legged vertex, `hhh` from a three-legged one), then pairs and singles to
reach `higgsShare`. Placing them after the fermion lines meant nearly every
candidate was blocked by a neighbour already committed to ffVV, and the Higgs
vertices never appeared at all.

Fermion lines are then laid as **closed loops**, which makes "two legs at every
vertex it touches" true by construction, with no parity to repair afterwards.
Cycles are searched depth-first from the most constrained vertices outward.

`splitQuads` (splitting four-legged vertices into two three-legged ones) is off:
it improves the solid-to-wavy ratio but leaves no four-legged vertices, and
`hhhh` needs one.

### House rules the generator enforces

These are checked, not eyeballed — run `node render/verify_network.mjs`:

- **at most four legs per vertex**
- **no two legs of one vertex closer than 14°**, and no closer than the
  preferred 24° wherever the mesh can spare the edge — in a tight spot a
  pinched angle beats a hole
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

### The poster QR

`design/Sigma Mu Mu Network.dc.html` carries the QR as a literal module matrix
in the `QR` constant, so nothing has to be fetched at render time. It encodes
`https://hepalumni.muoncollider.us`. If the address changes, regenerate it:

```sh
pip install segno
python3 -c "
import segno
q = segno.make('https://hepalumni.muoncollider.us', error='m')
print('\n'.join(\"  '\" + ''.join('1' if v else '0' for v in r) + \"',\" for r in q.matrix))"
```

and paste the rows over the existing ones. The drawing code and the quiet-zone
exclusion both read `QR.length`, so a different version just works.
