# σμμ — A Physics × Industry Mixer · Poster System

A generative, subtly animated event poster for **σμμ**, the physics × industry
mixer on the muon collider (Sunday, December 13, 2026 · 5:00 PM · Stanford
campus).

Swiss-modern letterpress look: a muon-collider event drawn as fine engraved
line work — concentric detector rings of hairline arcs, a dimuon event at the
interaction point, counter-circulating μ⁺/μ⁻ bunches, calorimeter deposits,
and an s-channel Feynman footnote — set in two letterpress inks (warm black +
vermillion) on cream stock, under Inter Tight / JetBrains Mono typography.

The sketch is written with [p5.js](https://p5js.org) (Processing's JavaScript
sibling). Every frame is a pure function of the loop phase `u ∈ [0,1)`, so
renders are deterministic and the animation loops seamlessly (20 s period):
detector rings slowly precess, dash patterns creep one cell per loop, track
curvatures breathe, the boson line's phase slides, and the two bunches
complete one counter-rotating revolution — meeting at the interaction point.

## Live preview

Open `poster/index.html` over any static server, e.g.

```sh
npx http-server . -p 8000
# http://localhost:8000/poster/?format=tabloid
```

`?format=` one of `tabloid · ig · igsq · linkedin · livideo · story`.
Other params: `ss` (supersample), `anim=0` + `t=0.13` (frozen phase),
`w`/`h` (override pixel size).

## Deliverables (`out/`)

| File | Use |
|---|---|
| `sigmamumu-poster-tabloid-3300x5100.png` | Tabloid 11×17 in @ 300 dpi print poster |
| `sigmamumu-poster-tabloid-11x17.pdf` | Same, as a print-ready PDF |
| `sigmamumu-instagram-1080x1350.mp4` | Instagram feed post (4:5, 20 s seamless loop) |
| `sigmamumu-instagram-1080x1350.png` | Instagram feed still |
| `sigmamumu-instagram-square-1080.png` | Instagram square / grid still |
| `sigmamumu-story-1080x1920.mp4` | Instagram Story / Reels loop |
| `sigmamumu-story-1080x1920.png` | Story still |
| `sigmamumu-linkedin-1920x1080.mp4` | LinkedIn video post (16:9, 20 s loop) |
| `sigmamumu-linkedin-1200x627.png` | LinkedIn feed/link image |

## Rendering

Headless Chromium (Playwright) draws the sketch; frames are piped straight
into ffmpeg (libx264, yuv420p, faststart). Stills are captured supersampled
and downscaled with Lanczos.

```sh
cd render && npm install         # playwright-core (uses the system Chromium)
export CHROMIUM_PATH=/path/to/chrome            # optional
export FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")

# a still
node render/render.mjs still --format tabloid --ss 1.5 --t 0.13 \
     --scale 3300x5100 --out out/poster.png

# a 20 s looping video
node render/render.mjs video --format ig --ss 2 --fps 30 --seconds 20 \
     --scale 1080x1350 --out out/ig.mp4

# everything
bash render/render_all_videos.sh
```

The 11×17 PDF: `python3 -m img2pdf out/sigmamumu-poster-tabloid-3300x5100.png
--pagesize 11inx17in -o out/sigmamumu-poster-tabloid-11x17.pdf`.

## Design system

- **Stock** `#F5F1E6` · **ink** `#231F1A` · **vermillion** `#D8371D`, drawn in
  multiply so overlapping inks print like real overprints; static paper grain.
- **Type**: Inter Tight (400–800) for display/text, JetBrains Mono for
  technical labels — both self-hosted (OFL) in `poster/fonts/`, chosen for
  full Greek coverage (σ, μ). The giant σμμ carries a slight red-plate
  misregistration, the letterpress tell.
- **Physics**: jets and a photon land in lit calorimeter cells; the two red
  muon chords punch through every layer and mark the muon chambers they
  cross; the beam axis, IP crosshair, and σ(μ⁺μ⁻ → X) · 10 TeV caption tie
  the artwork to the event's subject.
- Arrows and Feynman elements are drawn as vectors (the webfont subsets lack
  U+2192), and the layout adapts per aspect ratio via `PRESETS` in
  `poster/sketch.js`, where all copy lives in `COPY`.
