# The two emails

| file | what it is | subject |
| --- | --- | --- |
| `hepalumni-invitation.html` | the reunion invitation | Old friends, new physics |
| `usmcc2026-registration.html` | registration is open for the annual meeting | USMCC 2026 registration is open |

Each has a `.txt` beside it — set that as the multipart/alternative part.
Both wear the cream skin. The meeting mail was the dark one until the Gmail
app inverted it element by element on a phone — a muddy near-white sheet,
brown headlines, the white mark invisible against it.

Gmail's apps re-colour every message when the app is in dark theme and
honour no opt-out, so three things are arranged against that, and one is
outside our reach:

- **One palette, declared as both.** Each mail says `color-scheme: light dark`
  and carries a `prefers-color-scheme: dark` block whose colours *are* the
  cream ones. It costs nothing and helps the hosted copies and the `.eml`,
  where a `<style>` block survives. It does **not** help the paste route: a
  compose window keeps inline styles and attributes and throws the `<head>`
  away. `render/mail-web.mjs` fails the build if that block ever names a
  colour the mail does not use elsewhere — a second palette in there is what a
  dark-mode paste would bake in.
- **Transparent images, deliberately.** The USMCC mark is the published
  transparent PNG. A cream tile was tried and reverted: a client that darkens
  the sheet leaves image pixels alone, so the tile became a bright box in the
  corner, while the transparent mark gets inverted along with the text and
  reads as a light mark on the dark ground.
- **Not a dark skin.** The meeting mail was dark once and Gmail's app flipped
  it to a muddy near-white with brown headlines. The conversion does not ask
  which way a mail is built; it re-colours toward its own theme regardless. A
  cream mail flipped is coherent, a dark mail flipped is not.
- **Nothing else.** If Gmail's app darkens the sheet, it darkens it; the
  reader's setting wins, as it should. What the points above buy is that the
  result stays legible rather than falling apart.

**One palette each, baked in.** Neither mail has a `prefers-color-scheme`
block any more, and neither swaps an image for dark mode. They are sent by
copying the rendered page out of a browser, and a paste carries whatever the
browser resolved — so a dark rule could only ever arrive as cream text on
whichever ground the compose window kept. Each mail declares the scheme it
already is, so a client has no reason to invert it, and every table and padded
cell carries its ground as a `bgcolor` attribute as well as a style, because
the attribute is what survives a paste. `render/mail-web.mjs` fails the build
if a dark block reappears.

## The invitation email

`hepalumni-invitation.html` is the HTML mail to send to the collaboration,
written to be forwarded on: the ask is that each recipient personally invites
five people. `hepalumni-invitation.txt` is the plain-text alternative — set it
as the multipart/alternative part, or paste it if your client asks.

### Subject line

Send it as:

> **Old friends, new physics**

Two alternatives, if the list has seen the first:

> You're invited: an evening for HEP alumni
> Save the evening of December 13

The preview line (already in the HTML, hidden) reads *An evening at Stanford
on December 13, 2026, with remarks from Michael Peskin.* Most clients show it
after the subject, so it carries the date and the name rather than repeating
the subject.

The mail is an invitation first. Prof. Peskin's opening remarks are the draw,
and the request to pass it on to five HEP alumni friends waits until the three
closing actions, after the reader has been invited and given the details.

### How it is built

Email clients are not browsers. This file is written for them:

- **The website's own rhythm.** One tracked label per section and no more,
  the big uppercase title, the date set large with the venue tracked under
  it, hairline rules rather than tinted panels, and an ink-black button — the
  same moves the site makes, in the same order. Restraint is the house style;
  a stack of eyebrows and callout boxes reads as a template.
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
  "[Message clipped] View entire message" and would cut the closing actions.
- **`color-scheme: light`**, an explicit background on every cell, and a
  `bgcolor` attribute beside it — as far as one can go to stop a dark-mode
  client inverting cream to sludge.

### What to change before sending

- The signature names Lawrence Lee and Kiley Kennedy. If someone else sends
  it, change the sign-off and the two `mailto:` links.
- Nothing in it repeats the website's own copy, so the two can be read back to
  back. If the site's wording changes, this does not have to follow.

### Checking it

Rendered at 600px and at 375px through the same headless Chromium the poster
uses. Litmus or Email on Acid will tell you more if the list is large enough
to be worth it; the layout is a single 600px column of table rows, which is
the shape those services have the least to say about.


## The registration email

Subject: **USMCC 2026 registration is open**. Two alternatives if the list has
already seen that:

> Early bird for USMCC 2026 ends 23 October
> Stanford, 13–16 December: registration is open

The preview line carries the deadline rather than repeating the subject —
*Early bird closes 23 October. Stanford, 13–16 December.*

It is ordered the way the reader decides: the news, the deadline, the button,
then the reasons (the program), then the two things that need doing early (a
poster, a parallel contribution), then the shape of the week, then the Sunday
reunion.

One button, to `indico.muoncollider.us/e/usmcc2026`. The reunion link is the
only other route out.

### Check before sending

- **The early-bird date.** This mail says **23 October 2026**, as asked. The
  Indico registration page currently reads *"Early Bird Registration (before
  Nov 1, 2026)"*. One of the two needs changing, and the page is the one
  people will quote back.
- **The poster call** is described as submitted "through the meeting page" —
  the Call for Posters link in the Indico sidebar. If posters are collected
  somewhere else, point the sentence there.
- **The committee** is not listed in the mail, only pointed at. That keeps the
  mail short and means it cannot go stale when the committee changes.


## The copies on the website

Both mails carry a "Trouble viewing? Open in browser" line, for
the clients that mangle HTML mail or refuse it. It points at a copy hosted on
the event site:

A dark variant of each sits at `…/paste-dark/`, generated from the same
source by swapping values — brown ground, bone type, the white mark. It is
there to be tested against the cream one in the Gmail app, not because it is
known to be better: the meeting mail was near-black once and Gmail flipped it
to a muddy light sheet. If a test send says the brown one survives, make it
the default; if not, delete the variant from `render/mail-web.mjs`.

| mail | to send from (paste copy) | where the browser line points |
| --- | --- | --- |
| reunion | `…/mail/reunion/paste/` | `https://hepalumni.muoncollider.us/mail/reunion/` |
| registration | `…/mail/registration/paste/` | `https://hepalumni.muoncollider.us/mail/registration/` |

    node render/mail-web.mjs        # after editing either mail

The copies are **generated**, not written: edit the mail in `email/`, re-run
the script, commit all four. Both get `noindex, nofollow`; only the browser
copy loses the "Trouble viewing?" row, since its reader is already in a
browser.

They live in `site/static/`, so Hugo copies them verbatim and they cannot
reach the sitemap, and nothing on the site links to them — the mails do, which
is the whole point. They go live with the next deploy of the site, so send the
mail *after* that, or the link 404s.


## Sending them

### When someone else does the sending

The chairs are on Macs, in Gmail or Outlook, and will not run a script. Send
them a link to the paste copy and four lines:

> Open <https://hepalumni.muoncollider.us/mail/reunion/paste/> in your browser.
> Select all (⌘A), copy (⌘C).
> In a new Gmail or Outlook message, click into the body and paste (⌘V).
> Subject: **Old friends, new physics**. Don't edit the body — send as is.

The paste copy is the mail entire, browser line included — that line has to
reach the inbox, being the recipient's way out when a client mangles the
message. The only copy that drops it is the browser one it points at.

### The simplest route: the finished message

    node render/mail-eml.mjs        # -> out/reunion.eml, out/registration.eml

An `.eml` *is* the message — headers, plain-text part, HTML part — so nothing
has to survive a compose window. In **Apple Mail**, **Message → Redirect**,
⌘⇧E, puts the recipients in and sends it on untouched. Redirect, not Forward:
forwarding runs it back through the editor, which is the thing being avoided.

Redirect needs the message to be **in a mailbox**. A double-clicked `.eml`
opens in a window with no account behind it and the whole Message menu is
greyed out; drag the file onto a mailbox in the sidebar first, then select it
there. With no local mailbox to drag onto, the `.mbox` written beside the
messages holds both of them: File → Import Mailboxes → Files in mbox format.

The `From:` line says Lawrence Lee; redirecting adds your own address as
`Resent-From`, so change that constant in the script if someone else sends it.

**Outlook, classic on Windows**, has its own door: in a new message, Insert →
Attach File → the arrow beside Insert → **Insert as Text**, and pick the
`.html`. New Outlook and outlook.com have no equivalent — use the `.eml` in
Apple Mail, or Thunderbird's Insert → HTML.

### From your own Gmail address

Gmail's compose window has no HTML source view, and nothing adds one. Apps
Script goes in the other door — it hands Gmail the HTML directly, and the
draft that appears in the account is the mail exactly as written:

    node render/gmail-draft.mjs     # -> out/gmail-draft.gs

Paste that file into a new project at script.google.com, save, and run
`createReunionDraft()` or `createRegistrationDraft()`. Google asks once for
permission to manage drafts; it is your own account asking about your own
script. `TO` at the top of the file is blank, which drafts to yourself — fill
it in when the draft reads right. The script editor is a plain text box, so
nothing renders on the way through and nothing is baked in.

It is generated from `email/`, so re-run it after editing either mail. Gmail's
own sending limits apply, so a list of any size still belongs in a list tool.

### Other routes

The best of them is to hand the client the **file**, not a rendering of it:
Thunderbird's *Insert → HTML*, Apple Mail with the file dragged in, or any
list tool (Mailchimp, a listserv's web form, a Python `smtplib` script) that
takes an HTML source and a `text/plain` alternative. That way every byte here
arrives as written.

If instead you open the mail in a browser, select all and paste into a compose
window, **use the paste copy**:

| mail | paste copy |
| --- | --- |
| reunion | `https://hepalumni.muoncollider.us/mail/reunion/paste/` |
| registration | `https://hepalumni.muoncollider.us/mail/registration/paste/` |

A copy-paste does not carry the source. It carries the *rendered* page: the
browser has already resolved the stylesheet, media queries included, and the
clipboard holds the result baked into inline styles. Paste from a machine in
dark mode and the cream-on-black palette comes along as inline colour — while
the backgrounds, which a compose window strips, do not. The mail arrives as
cream text on a cream ground: the σμμ lockup and every bold run invisible.

The paste copies carry no dark rules at all, so there is nothing to bake in
and they paste as the cream skin whatever theme the machine is wearing. They
are generated by the same script, at the same time.

One caveat for the registration mail, which is dark by design: a compose
window that drops table backgrounds will leave its cream text on white. Send
that one as a file if you can.
