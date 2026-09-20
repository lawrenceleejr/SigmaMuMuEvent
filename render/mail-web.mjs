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
    paste: 'site/static/mail/reunion/paste/index.html' },
  { src: 'email/usmcc2026-registration.html',
    out: 'site/static/mail/registration/index.html',
    paste: 'site/static/mail/registration/paste/index.html' },
];

const write = async (path, html) => {
  await mkdir(resolve(ROOT, path, '..'), { recursive: true });
  await writeFile(resolve(ROOT, path), html);
};

for (const { src, out, paste } of MAILS) {
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
}
