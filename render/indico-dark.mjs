#!/usr/bin/env node
/* Derive the dark Indico skin from the light one.
 *
 *   node render/indico-dark.mjs
 *
 * Two standalone stylesheets would drift the moment one of them is edited, and
 * Indico only accepts a single uploaded file, so the dark sheet cannot simply
 * @import the light one without making the whole page depend on the event site
 * being up. Instead it is generated: edit sigmamumu-indico.css, re-run this,
 * and the dark sheet follows.
 *
 * Everything here is a value swap. No selector is added or removed, so the two
 * files always cover exactly the same ground.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SRC = resolve(ROOT, 'indico/sigmamumu-indico.css');
const OUT = resolve(ROOT, 'indico/sigmamumu-indico-dark.css');

let css = await readFile(SRC, 'utf8');
const before = css.length;
const swap = (from, to, opts = {}) => {
  const n = css.split(from).length - 1;
  if (!n && !opts.optional) {
    console.error(`  MISSING: ${from.slice(0, 60)}`);
    process.exitCode = 1;
    return;
  }
  css = css.split(from).join(to);
};

// ---- palette ------------------------------------------------------------
swap('--smm-paper: #f5f0e1;', '--smm-paper: #141312;');
swap('--smm-ink: #201e1d;', '--smm-ink: #efe9da;');
swap('--smm-accent: #ec3013;', '--smm-accent: #ff5230;');   // hotter, to carry on black
swap('--smm-muted: #605d5d;', '--smm-muted: #9b948a;');
swap('--smm-rule: rgba(32, 30, 29, 0.18);', '--smm-rule: rgba(239, 233, 218, 0.22);');
swap('--smm-hair: rgba(32, 30, 29, 0.1);', '--smm-hair: rgba(239, 233, 218, 0.14);');
swap('--smm-glass: rgba(245, 240, 225, 0.62);', '--smm-glass: rgba(28, 26, 24, 0.62);');
swap('--smm-glass-solid: rgba(245, 240, 225, 0.95);', '--smm-glass-solid: rgba(28, 26, 24, 0.95);');
swap('--smm-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset,\n'
   + '                0 18px 50px -30px rgba(32, 30, 29, 0.45);',
     '--smm-shadow: 0 1px 0 rgba(239, 233, 218, 0.08) inset,\n'
   + '                0 18px 50px -28px rgba(0, 0, 0, 0.85);');
swap('--smm-veil: 0.38;', '--smm-veil: 0.45;');

// ---- literals that mean "the page ground" -------------------------------
swap('rgba(245, 240, 225, var(--smm-veil))', 'rgba(20, 19, 18, var(--smm-veil))');
swap('rgba(245, 240, 225, 0.25)', 'rgba(239, 233, 218, 0.22)');
swap('rgba(245, 240, 225, 0.75)', 'rgba(239, 233, 218, 0.7)');
swap('rgba(245, 240, 225, 0.9) !important', 'rgba(34, 31, 29, 0.9) !important');
swap('rgba(245, 240, 225, 0.55) !important', 'rgba(34, 31, 29, 0.6) !important');
swap('background: rgba(255, 255, 255, 0.55) !important',
     'background: rgba(255, 255, 255, 0.06) !important');
swap('border: 1px solid rgba(32, 30, 29, 0.35) !important',
     'border: 1px solid rgba(239, 233, 218, 0.4) !important');

// ---- assets -------------------------------------------------------------
swap('img/field-live.svg', 'img/field-live-dark.svg');
swap('img/field-still.png', 'img/field-still-dark.png');

// ---- the two bars -------------------------------------------------------
// On the light skin these are ink; here ink is the type colour, so the bars
// take a tone of their own and their text has to flip with them. Without this
// the header links stay --smm-paper, which is now almost black on almost black.
swap(`.event-page-header {
  background: var(--smm-ink) !important;`,
     `.event-page-header {
  /* ink is the type colour on this skin, so the bars take their own tone */
  background: #0c0b0b !important;`);
swap(`.footer, .footer > .flexrow {
  background: var(--smm-ink) !important;`,
     `.footer, .footer > .flexrow {
  background: #0c0b0b !important;`);
swap(`#session-bar a, #session-bar .i-button {
  color: var(--smm-paper) !important;`,
     `#session-bar a, #session-bar .i-button {
  color: var(--smm-ink) !important;`);

// ---- print --------------------------------------------------------------
// Paper is still paper: force the type back to black or a dark skin prints
// bone-on-white and vanishes.
swap(`@media print {
  /* paper is still paper */
  html { background: #fff !important; }`,
     `@media print {
  /* paper is still paper, and bone type on white would vanish */
  html { background: #fff !important; }
  body, .confTitle, .confTitle h1, .confSubTitle,
  .confBodyBox, .conf_leftMenu, .confBodyBox * { color: #000 !important; }`,
     { optional: true });
swap(`@media print {
  html { background: #fff !important; }`,
     `@media print {
  /* paper is still paper, and bone type on white would vanish */
  html { background: #fff !important; }
  body, .confTitle, .confTitle h1, .confSubTitle,
  .confBodyBox, .conf_leftMenu, .confBodyBox * { color: #000 !important; }`,
     { optional: true });

// ---- the header comment -------------------------------------------------
swap('   σμμ — a skin for the Indico event page',
     '   σμμ — a skin for the Indico event page, dark');
swap(`   It dresses Indico in the identity used by the poster and by
   hepalumni.muoncollider.us: cream stock, warm near-black ink, one vermillion
   accent, Archivo for the voice, and the Feynman network behind frosted glass.`,
     `   The same identity read as a negative: near-black ground, warm bone type, a
   hotter vermillion so the accent still carries, and the Feynman network
   drawing itself in light lines behind smoked glass.

   Generated from sigmamumu-indico.css by render/indico-dark.mjs — edit that
   file, not this one, then re-run the script. Install one skin or the other,
   never both.`);

await writeFile(OUT, css);
console.log(`wrote ${OUT}`);
console.log(`  ${before} -> ${css.length} bytes, ${css.split('{').length - 1} rule blocks`);
if (/#f5f0e1|#201e1d|#ec3013/.test(css)) {
  console.error('  WARNING: a light-palette hex survived the swap');
  process.exitCode = 1;
}
