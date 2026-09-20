#!/usr/bin/env node
/* Build each mail as a finished message on disk.
 *
 *   node render/mail-eml.mjs
 *
 * An .eml is the message itself -- headers, the plain-text part, the HTML
 * part -- so nothing has to survive a compose window. Open one in Apple Mail
 * (double-click, or drag it onto the Mail icon) and it appears as a message.
 * Message -> Redirect, ⌘⇧E, puts the recipients in and sends it on untouched;
 * Forward would re-render it through the editor, which is the thing to avoid.
 *
 * Both parts go out base64-encoded in UTF-8. The mails carry σ, μ, × and en
 * dashes, and base64 is the encoding that cannot corrupt them on the way.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const FROM = 'Lawrence Lee <LLee@utk.edu>';
const MAILS = [
  { src: 'email/hepalumni-invitation',   out: 'out/reunion.eml',
    subject: 'Old friends, new physics' },
  { src: 'email/usmcc2026-registration', out: 'out/registration.eml',
    subject: 'USMCC 2026 registration is open' },
];

// RFC 2047, for the subject: plain ASCII today, but a σ in one would otherwise
// arrive as mojibake in the one place a reader cannot miss it.
const header = s => /^[\x20-\x7e]*$/.test(s)
  ? s
  : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';

const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

for (const m of MAILS) {
  const html = await readFile(resolve(ROOT, `${m.src}.html`), 'utf8');
  const text = await readFile(resolve(ROOT, `${m.src}.txt`), 'utf8');
  const boundary = '----smm-' + Buffer.from(m.src).toString('hex').slice(0, 16);

  const eml = [
    `From: ${FROM}`,
    `Subject: ${header(m.subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    'This is a message in MIME format.',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  await mkdir(resolve(ROOT, m.out, '..'), { recursive: true });
  await writeFile(resolve(ROOT, m.out), eml);
  console.log(`${m.src} -> ${m.out}  (${eml.length} bytes)`);
}
