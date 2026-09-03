# σμμ skin for Indico

Two skins for the Indico event page at
<https://indico.muoncollider.us/e/hepalumni>, in the same identity as the
poster and <https://hepalumni.muoncollider.us>. **Install one, not both.**

| file | look |
| --- | --- |
| `sigmamumu-indico.css` | cream stock, warm near-black ink, one vermillion accent |
| `sigmamumu-indico-dark.css` | the same read as a negative: near-black ground, bone type, a hotter vermillion |

The dark sheet is **generated** from the light one by `render/indico-dark.mjs`,
which swaps values only — no selector is added or removed, so the two always
cover the same ground. Edit `sigmamumu-indico.css`, re-run the script, and the
dark sheet follows. Do not hand-edit the dark file.

## Installing it

1. Open the event → **Management** (the pencil) → **Layout**.
2. Under **Custom CSS**, upload `sigmamumu-indico.css`.
3. Save, then reload the public page.

Indico only offers custom CSS on **conference**-type events. This event is one,
so the option is there. If the event were ever converted to a meeting or
lecture the option would disappear along with the styling.

To undo it, delete the file in the same place. Nothing else about the event is
touched.

## What it depends on

Two assets are pulled from the event site, which must be published first:

| what | where |
| --- | --- |
| Archivo + Libertinus Math | `/fonts/fonts.css` |
| the animated field | `/img/field-live.svg`, `/img/field-live-dark.svg` |
| the still field, for reduced motion | `/img/field-still.png`, `/img/field-still-dark.png` |

all under `https://hepalumni.muoncollider.us`.

Both are already in this repository under `site/static/`, so they go live with
the site. Until then — or if that host is ever unreachable — the page falls
back to a system grotesque on plain cream, which still reads correctly. Nothing
breaks, it just loses the texture.

## The background animates

Indico only accepts a stylesheet, so the canvas that animates the website
cannot run here. But an SVG referenced from CSS as a `background-image` is
loaded in *secure animated mode* — scripts do not run, yet its own CSS
animations do. So the motion is declared inside the file, and the field draws
itself: lines grow out of their vertices in the order `build()` computes, hold,
fade, and begin again on a 26-second loop. Each line's place in that order
becomes a negative `animation-delay`, so the field is always mid-life somewhere
rather than restarting in unison, and every vertex mark lands a beat before the
lines that grow out of it.

What this cannot reproduce is the website's scroll-driven flood with a
dissolving tail — that needs per-frame control, which means JavaScript.

Solid lines and boson waves draw themselves with `stroke-dashoffset`, on the
same growth curve the website uses — `1 - (1 - t)^5.5`, fast out of the vertex
then a long decay. A CSS animation between two keyframes is linear and
`animation-timing-function` only offers cubic-béziers, which cannot hold an
initial slope of 5.5 without distorting the tail, so the generator traces the
curve as keyframes instead: 23 stops, placed where it actually bends (almost
all of them in the first tenth of the loop) and linear in between, which lands
within 0.2% of the exact curve. Every drawn path carries `pathLength="1"`, so
one shared set of stops fits a 20px edge and a 200px one alike. Scalars are
dashed and their `stroke-dasharray` is already spoken for, so they fade in
instead. Under `prefers-reduced-motion` the SVG stops itself *and* the
stylesheet swaps in the flat PNG — belt and braces.

Both fields come from the same `design/network.js` that draws the poster, so
the physics is the real thing: every vertex is a legal Standard Model vertex.

    node render/field-svg.mjs                 # animated, light
    node render/field-svg.mjs --theme dark
    node render/field-still.mjs               # flat, light
    node render/field-still.mjs --dark

## Two things CSS cannot fix

- **The event title shows raw LaTeX.** It is stored as
  `\sigma_{\mu\mu}: A Particle Physics Alumni Reunion`, and Indico does not run
  MathJax over the page header, so visitors see the backslashes. Rename the
  event to `σμμ: A Particle Physics Alumni Reunion` using real Unicode
  characters. The stylesheet deliberately never uppercases the title, because
  that would set σμμ as ΣΜΜ.
- **Indico's own chrome.** The top bar and footer are restyled to ink and
  cream, but the login flow, management views and error pages are outside the
  event layout and keep Indico's default look.

## Notes on the approach

Indico's layout mechanics are left alone — only surfaces, type, spacing and
colour change — so an upgrade should not break the page; it would just show a
little unstyled furniture wherever new markup appears.

The one exception is a short **make Indico fluid** section near the top. The
conference theme hard-codes pixel widths (950px on the title and the section
box, 700px on the dateline, 200px on the menu), which gave a phone a 983px
document in a 390px viewport with everything spilling off the right. Those
widths are unpinned so the page reflows; verified at 390px with zero
overflowing elements.

`--smm-veil` at the top of the file controls how much cream sits over the
background field. Raise it toward `1` for a quieter page, lower it for more
texture.
