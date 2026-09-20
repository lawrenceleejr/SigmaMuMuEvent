#!/usr/bin/env node
/* Put the mails on the website, so "open it in your browser" has somewhere to
 * go when a client mangles the HTML or blocks it outright.
 *
 *   node render/mail-web.mjs
 *
 * The hosted copy is generated rather than written, for the same reason the
 * dark Indico skin is: two files that say the same thing drift the moment one
 * of them is edited. Edit the mail in email/, re-run this, and the page
 * follows.
 *
 * Two differences from what lands in the inbox, and only two:
 *
 *   · the "Trouble seeing this?" line goes, since on the web the reader is
 *     already in their browser;
 *   · the page asks not to be indexed, because it is a copy of something sent
 *     to a list rather than a page of the site.
 *
 * They go in static/ rather than content/, so Hugo copies them verbatim and
 * they can never reach the sitemap. Nothing on the site links to them; the
 * mails do, and that is the whole point.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const MAILS = [
  { src: 'email/hepalumni-invitation.html',   out: 'site/static/mail/reunion/index.html' },
  { src: 'email/usmcc2026-registration.html', out: 'site/static/mail/registration/index.html' },
];

for (const { src, out } of MAILS) {
  let html = await readFile(resolve(ROOT, src), 'utf8');
  const before = html.length;

  // The line only makes sense in an inbox. Matched by its link, so a reworded
  // sentence still goes, and a missing one is an error rather than a silent
  // pass -- a hosted copy still offering to open itself is the tell that this
  // script stopped working.
  // Attribute-tolerant: these tags carry classes now (the dark-mode palette
  // hangs off them), and more may arrive. Key on the sentence, not the markup.
  const row = html.match(/<table [^>]*role="presentation"[^>]*>\n<tr><td [^>]*>\n  Trouble seeing this\?.*?\n<\/table>\n\n/s);
  if (!row) {
    console.error(`  MISSING: no "Trouble seeing this?" row in ${src}`);
    process.exitCode = 1;
    continue;
  }
  html = html.replace(row[0], '');

  const meta = '<meta name="robots" content="noindex, nofollow">\n';
  if (!html.includes(meta)) {
    html = html.replace('<meta name="x-apple-disable-message-reformatting">\n', meta);
  }
  html = html.replace('<!doctype html>\n',
    '<!doctype html>\n<!-- Generated from ' + src + ' by render/mail-web.mjs. Edit that, not this. -->\n');

  await mkdir(resolve(ROOT, out, '..'), { recursive: true });
  await writeFile(resolve(ROOT, out), html);
  console.log(`${src} -> ${out}  (${before} -> ${html.length} bytes)`);
}
