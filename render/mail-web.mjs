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
  { src: 'email/hepalumni-invitation.html',   out: 'site/static/mail/reunion/index.html',
    paste: 'site/static/mail/reunion/paste/index.html' },
  { src: 'email/usmcc2026-registration.html', out: 'site/static/mail/registration/index.html',
    paste: 'site/static/mail/registration/paste/index.html' },
];

/* The paste copy: the same mail with every trace of the dark palette taken
 * out, and its grounds nailed down.
 *
 * It exists for the one way of sending these that everybody can do -- open the
 * mail in a browser, select all, paste into a Gmail or Outlook compose window.
 * What the clipboard carries is not the source but the *rendered* page: the
 * browser resolves the stylesheet, media queries included, and bakes the
 * result into inline styles. Do that on a machine whose system theme is dark
 * and the cream-on-black palette comes along as inline colour, while the
 * grounds -- which a compose window is quick to drop -- do not. Cream text,
 * cream ground, an invisible mail.
 *
 * Two answers here. There are no dark rules left to resolve, so nothing of
 * that palette can be baked in. And every table and every padded cell carries
 * its ground as a bgcolor attribute as well as a style: a compose window that
 * drops the CSS background usually keeps the attribute, which is why the
 * attribute outlived the CSS property in mail to begin with.
 */
function pasteCopy(html) {
  // The dark rules, and the comments that introduce them.
  const dark = html.match(
    /(?:  \/\*(?:(?!\*\/)[\s\S])*?\*\/\n)*  @media \(prefers-color-scheme: dark\) \{[\s\S]*?\n  \}\n/);
  if (!dark) return null;
  const ground = html.match(/<body[^>]*background-color:(#[0-9a-f]{6})/i);
  if (!ground) return null;
  const paper = ground[1];

  return html
    .replace(dark[0], '')
    .replace('  .img-dark { display: none !important; }\n', '')
    .replace(/\n *<img class="img-dark"[^>]*>/g, '')
    .replace('<meta name="color-scheme" content="light dark">',
             '<meta name="color-scheme" content="light">')
    .replace('<meta name="supported-color-schemes" content="light dark">',
             '<meta name="supported-color-schemes" content="light">')
    // the ground, as an attribute a compose window will keep
    .replace(new RegExp(`<table([^>]*background-color:${paper}[^>]*)>`, 'gi'),
             `<table bgcolor="${paper}"$1>`)
    // and on each content cell, so the sheet survives even if the tables do not
    .replace(/<td class="((?:pad|ink|muted|accent|title|date|head)[^"]*)"/g,
             `<td bgcolor="${paper}" class="$1"`);
}

for (const { src, out, paste } of MAILS) {
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

  const light = pasteCopy(html);
  if (!light) {
    console.error(`  MISSING: no dark-palette block in ${src}`);
    process.exitCode = 1;
    continue;
  }
  if (/prefers-color-scheme|img-dark/.test(light)) {
    console.error(`  LEFTOVER: dark-mode markup survived in the paste copy of ${src}`);
    process.exitCode = 1;
    continue;
  }
  await mkdir(resolve(ROOT, paste, '..'), { recursive: true });
  await writeFile(resolve(ROOT, paste), light);
  console.log(`${src} -> ${paste}  (paste copy, ${light.length} bytes)`);
}
