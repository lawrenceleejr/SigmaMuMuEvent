# σμμ skin for Indico

`sigmamumu-indico.css` dresses the Indico event page at
<https://indico.muoncollider.us/e/hepalumni> in the same identity as the poster
and <https://hepalumni.muoncollider.us>: cream stock, warm near-black ink, one
vermillion accent, Archivo for the voice, and the Feynman network behind
frosted glass.

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
| Archivo + Libertinus Math | `https://hepalumni.muoncollider.us/fonts/fonts.css` |
| the Feynman field | `https://hepalumni.muoncollider.us/img/field-still.png` |

Both are already in this repository under `site/static/`, so they go live with
the site. Until then — or if that host is ever unreachable — the page falls
back to a system grotesque on plain cream, which still reads correctly. Nothing
breaks, it just loses the texture.

`field-still.png` is generated from the same `design/network.js` that draws the
poster, so its physics is the real thing: every vertex is a legal Standard
Model vertex. To regenerate it at a different size or density, edit and re-run
the snippet in `render/field-still.mjs`.

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
