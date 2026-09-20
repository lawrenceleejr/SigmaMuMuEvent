# Institutional marks

Downloaded from each institution's own brand site on 20 September 2026, not
from an image search. Every file has a transparent background.

| file | what it is | from |
| --- | --- | --- |
| `original/slac.png` | SLAC wordmark, 2130 × 633 | `www6.slac.stanford.edu` |
| `original/stanford-university-stacked.png` | Stanford University signature, stacked, 600 × 400 | `identity.stanford.edu` |
| `original/ut-knoxville-horizontal.png` | UT Knoxville lockup, horizontal, 2075 × 959 | `brand.utk.edu` |
| `original/ut-knoxville-stacked.png` | the same, centred, 1607 × 1273 | `brand.utk.edu` |

`row/` holds the same marks trimmed to their own ink and scaled to sit
together: institutions publish their logos with different margins built in,
and a heavy single word set to the same height as a stacked lockup of small
type will shout over it. The weights in `render/logos.py` are judged against
the rendered row rather than calculated, because optical balance is not
arithmetic. 150px of ink on a 200px transparent canvas, so they can be laid
out by baseline.

`white/` holds reversed versions for the dark skin — SLAC and Stanford only.
Both are one colour, so "the white version" has a single right answer: every
opaque pixel goes white and the existing alpha carries the antialiasing.

**Tennessee is deliberately not in `white/`.** It is grey type beside an
orange square holding a white T; knocking that through is a design decision,
not a conversion, and getting it wrong on a partner row is worse than not
having it. UT publishes an official *Reversed on Dark* version — it is in the
UT Logo Toolkit linked from `brand.utk.edu/logos/`, behind their PhotoShelter
gallery, which needs a person rather than a script. Drop it in beside the
others as `white/ut-knoxville-horizontal.png` and it will match.

## Before using them

These are trademarks, not assets in the ordinary sense. Each institution sets
rules on clear space, minimum size, what may sit next to the mark and what may
be implied by it — a logo row that reads as endorsement rather than
affiliation is the usual trap. The three brand sites above carry the current
guidance, and for a meeting page listing participating institutions the
normal course is a quick check with each communications office.

    python3 render/logos.py        # rebuilds row/ and white/ from original/
