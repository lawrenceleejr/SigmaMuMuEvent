#!/usr/bin/env node
/* Put the mails on the website, twice each.
 *
 *   node render/mail-web.mjs
 *
 * The copies are generated rather than written, for the same reason the dark
 * Indico skin is: two files that say the same thing drift the moment one of
 * them is edited. Edit the mail in email/, re-run this, and the pages follow.
 *
 *   mail/<name>/         the browser copy -- where "Trouble viewing? Open in
 *                        browser" points, so the line itself goes:
 *                        the reader is already in a browser.
 *
 *   mail/<name>/paste/   the copy to send from. Open it, select all, paste
 *                        into a Gmail or Outlook compose window. It keeps the
 *                        browser line, because that line has to reach the
 *                        inbox -- it is the recipient's way out when a client
 *                        mangles the mail.
 *
 * There is no longer anything to strip but that one row: the mails carry a
 * single baked palette and their grounds as attributes, so what the browser
 * renders is what the clipboard carries is what the mail should look like.
 *
 * Both live in site/static/, so Hugo copies them verbatim and they can never
 * reach the sitemap. Nothing on the site links to them; the mails do, and that
 * is the whole point.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const MAILS = [
  { src: 'email/hepalumni-invitation.html',
    out: 'site/static/mail/reunion/index.html',
    paste: 'site/static/mail/reunion/paste/index.html',
    dark: 'site/static/mail/reunion/paste-dark/index.html' },
  { src: 'email/usmcc2026-registration.html',
    out: 'site/static/mail/registration/index.html',
    paste: 'site/static/mail/registration/paste/index.html',
    dark: 'site/static/mail/registration/paste-dark/index.html' },
];

/* The dark variant, generated from the cream one by swapping values -- the
 * same trick the Indico skin uses, and for the same reason: a second file
 * kept by hand drifts from the first.
 *
 * It exists to be tested, not because it is known to be better. The evidence
 * so far is against it: the meeting mail was near-black once and Gmail's app
 * flipped it to a muddy light sheet. But the brown here is the brown Gmail
 * itself produced when it darkened the cream mail, which its heuristics may
 * treat differently from a near-black one. A test send settles it; nothing
 * else will.
 *
 * The grounds are attributes as well as styles, as in the cream mails, so the
 * swap has to reach both.
 */
const DARK = [
  ['#f5f0e1', '#2a2520'],   // the sheet: the brown Gmail chose for it
  ['#201e1d', '#f0ebdd'],   // type, and the button's fill
  ['#605d5d', '#b3aa9c'],   // fine print, one step brighter than it was dark
  ['#ec3013', '#ff5230'],   // the accent, opened up for a dark ground
  ['rgba(32,30,29,0.18)', 'rgba(240,235,221,0.22)'],
  ['USMCCLogo_black.png', 'USMCCLogo_white.png'],
  ['content="light dark"', 'content="dark"'],
  ['color-scheme: light dark', 'color-scheme: dark'],
];

function darkCopy(html) {
  // Placeholders first, so a swap cannot consume what an earlier swap wrote:
  // the ground becomes the brown that the type is about to become.
  let out = html;
  DARK.forEach(([from], i) => { out = out.split(from).join(`\u0000${i}\u0000`); });
  DARK.forEach(([, to], i) => { out = out.split(`\u0000${i}\u0000`).join(to); });
  return out;
}

const write = async (path, html) => {
  await mkdir(resolve(ROOT, path, '..'), { recursive: true });
  await writeFile(resolve(ROOT, path), html);
};

for (const { src, out, paste, dark } of MAILS) {
  const source = await readFile(resolve(ROOT, src), 'utf8');

  // The mails carry a dark-mode block whose colours are the light ones, to
  // claim dark support without changing anything (see the note in the mail).
  // A *second* palette in there is the bug this was built to end -- a paste
  // made in dark mode would bake it in -- so it fails the build instead of
  // shipping quietly.
  const darkBlock = source.match(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n  \}/);
  const palette = new Set((source.match(/<body[^>]*background-color:(#[0-9a-f]{6})/i) || []).slice(1));
  if (darkBlock) {
    const strangers = [...new Set(darkBlock[0].match(/#[0-9a-f]{6}/gi) || [])]
      .filter(c => !source.split(darkBlock[0]).join('').includes(c));
    if (strangers.length) {
      console.error(`  DARK RULES: ${src} has colours only its dark block uses: ${strangers.join(', ')}`);
      process.exitCode = 1;
      continue;
    }
  }
  void palette;

  let html = source.replace('<meta name="x-apple-disable-message-reformatting">\n',
    '<meta name="x-apple-disable-message-reformatting">\n<meta name="robots" content="noindex, nofollow">\n');
  html = html.replace('<!doctype html>\n',
    '<!doctype html>\n<!-- Generated from ' + src + ' by render/mail-web.mjs. Edit that, not this. -->\n');

  await write(paste, html);
  console.log(`${src} -> ${paste}  (paste copy, ${html.length} bytes)`);

  // Matched by the sentence rather than the markup, so a rewritten row still
  // goes and a missing one is an error -- a browser copy still offering to
  // open itself is the tell that this script stopped working. Reword the line
  // in the mails and this line has to follow.
  const row = html.match(/<table [^>]*role="presentation"[^>]*>\n<tr><td [^>]*>\n  Trouble viewing\?.*?\n<\/table>\n\n/s);
  if (!row) {
    console.error(`  MISSING: no "Trouble viewing?" row in ${src}`);
    process.exitCode = 1;
    continue;
  }
  const browser = html.replace(row[0], '');
  await write(out, browser);
  console.log(`${src} -> ${out}  (browser copy, ${browser.length} bytes)`);

  const inverted = darkCopy(html);
  if (/#f5f0e1|#201e1d|USMCCLogo_black/.test(inverted)) {
    console.error(`  HALF-SWAPPED: cream values survive in the dark copy of ${src}`);
    process.exitCode = 1;
    continue;
  }
  await write(dark, inverted);
  console.log(`${src} -> ${dark}  (dark variant, ${inverted.length} bytes)`);
}
