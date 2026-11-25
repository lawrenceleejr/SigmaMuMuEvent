/* Step the animated field down on a machine that cannot afford it.
 *
 * The field is an SVG of 609 lines, a third of them animating, drawn across
 * the whole viewport. Measured on a 1440x900 window in a software rasteriser:
 * about 20 fps, and 1.75 seconds of main-thread time every 3 seconds. The
 * same page with the field as a flat image: 60 fps and 0.04s. Good hardware
 * never notices; a ten-year-old laptop spends its afternoon on it.
 *
 * So: count frames once, and if the machine is struggling, move it down a rung.
 *
 *   full    as designed
 *   lite    the same field with a sixth of the lines moving (~40% of the work)
 *   still   the finished field as a PNG (~2%)
 *
 * The answer is remembered, so only the first page of a visit pays to find
 * out, and it is re-measured after a week in case the machine or the browser
 * has changed. Anyone who has asked for less motion goes straight to still
 * without being measured.
 *
 * Install by putting this file in <CUSTOMIZATION_DIR>/js/ on the Indico
 * server; it needs nothing else and talks to nothing. Without it the
 * stylesheet still steps down for a browser that reports a slow screen.
 */
(function () {
  'use strict';

  var KEY = 'smm-field';
  var WEEK = 7 * 24 * 60 * 60 * 1000;
  var html = document.documentElement;

  // Storage can be absent, full, or forbidden. None of that is a reason to
  // skip the measurement, so every read and write is allowed to fail.
  function remember(level) {
    try { localStorage.setItem(KEY, level + ':' + Date.now()); } catch (e) { /* fine */ }
  }
  function recalled() {
    try {
      var v = (localStorage.getItem(KEY) || '').split(':');
      if (!v[0]) return null;
      if (Date.now() - Number(v[1] || 0) > WEEK) return null;   // measure again
      return v[0];
    } catch (e) { return null; }
  }
  function set(level) {
    if (level === 'full') html.removeAttribute('data-smm-field');
    else html.setAttribute('data-smm-field', level);
  }

  // ?field=still|lite|full writes the preference and keeps it, which gives
  // support for "it is slow on my machine" something to say beyond "sorry".
  var asked = (location.search.match(/[?&]field=(still|lite|full)\b/) || [])[1];
  if (asked) { set(asked); remember(asked); return; }

  var known = recalled();
  if (known) { set(known); if (known !== 'full') return; }

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    set('still'); remember('still'); return;
  }

  // Measure. The first second after load is full of other work -- fonts,
  // images, Indico's own scripts -- so it is skipped rather than blamed on the
  // field. A hidden tab throttles rAF to a crawl and would fail every machine,
  // so measuring stops if the page is not being looked at.
  var START_AFTER = 1000, SAMPLE = 2000;
  function measure() {
    if (document.hidden) return;                 // try again when it is shown
    var frames = 0, t0 = 0;
    function tick(t) {
      if (!t0) { t0 = t; }
      frames++;
      var elapsed = t - t0;
      if (elapsed < SAMPLE) { requestAnimationFrame(tick); return; }
      if (document.hidden) return;               // hidden mid-sample: no verdict
      var fps = frames / (elapsed / 1000);
      // 45 and 24 rather than 60 and 30: a machine that merely misses a few
      // frames is not struggling, and the rung below is cheap enough that
      // being wrong about it costs the reader a little motion, not a working
      // page. Below 24 the page feels broken, and that is worth a still field.
      var level = fps < 24 ? 'still' : fps < 45 ? 'lite' : 'full';
      set(level); remember(level);
      if (window.console && level !== 'full') {
        console.info('[sigmamumu] ' + Math.round(fps) + ' fps; field set to ' + level
                   + '. Override with ?field=full');
      }
    }
    requestAnimationFrame(tick);
  }

  function begin() { setTimeout(measure, START_AFTER); }
  if (document.hidden) document.addEventListener('visibilitychange', function once() {
    if (!document.hidden) { document.removeEventListener('visibilitychange', once); begin(); }
  });
  else if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin);
})();
