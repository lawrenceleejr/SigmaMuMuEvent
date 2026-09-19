# The invitation email

`hepalumni-invitation.html` is the HTML mail to send to the collaboration,
written to be forwarded on: the ask is that each recipient personally invites
five people. `hepalumni-invitation.txt` is the plain-text alternative — set it
as the multipart/alternative part, or paste it if your client asks.

## Subject line

Send it as:

> **Bring five physicists back**

Two alternatives, if the list has seen the first:

> Who did HEP lose to industry?
> Five names, one evening, 13 December

The preview line (already in the HTML, hidden) reads *One evening at Stanford,
and five names from your address book.* Most clients show it after the
subject; it is deliberately not a repeat of the subject.

## How it is built

Email clients are not browsers. This file is written for them:

- **Tables and inline styles.** The `<style>` block carries only the mobile
  media query and link colour; strip it and nothing essential is lost.
- **No webfonts.** Archivo would not load in most clients, so the voice is a
  system grotesque and the σμμ lockup is set in a serif stack. Both are real
  text, so it reads with images off.
- **One image**, the USMCC mark in the footer, served from the event site. It
  carries alt text and explicit dimensions, so a blocked image leaves a tidy
  line rather than a hole.
- **One link target.** Every route out of the mail goes to
  `hepalumni.muoncollider.us`; the two organiser addresses are `mailto:`.
- **11 KB.** Gmail clips a message over about 102 KB, which shows as
  "[Message clipped] View entire message" and cuts the P.S. — the part after
  the subject that gets read most.
- **`color-scheme: light`** and an explicit background on every cell, which is
  as far as one can go to stop a dark-mode client inverting cream to sludge.

## What to change before sending

- The signature names Lawrence Lee and Kiley Kennedy. If someone else sends
  it, change the sign-off and the two `mailto:` links.
- Nothing in it repeats the website's own copy, so the two can be read back to
  back. If the site's wording changes, this does not have to follow.

## Checking it

Rendered at 600px and at 375px through the same headless Chromium the poster
uses. Litmus or Email on Acid will tell you more if the list is large enough
to be worth it; the layout is a single 600px column of table rows, which is
the shape those services have the least to say about.
