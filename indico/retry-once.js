/* Reload the page once if the server dropped one of its own assets.
 *
 * Indico serves ~9 MB of bundles through the application on a cold cache,
 * with Cache-Control: no-cache on content-hashed filenames. Under that burst
 * the largest responses sometimes arrive unfinished -- "cannot parse response"
 * in Safari -- and since one of them is jQuery, the page then throws
 * ReferenceErrors and renders as a blank sheet. The second load works, because
 * by then the browser has the rest cached and asks for little.
 *
 * This is a plaster, not the fix: the fix is three lines of Apache config
 * serving /dist off disk with a long cache. What this does is spare a visitor
 * the blank page, at the cost of one extra load for whoever was unlucky.
 *
 * It reloads at most once per tab per session. If the second load fails too,
 * it stops and leaves the page alone, because a reload loop on a struggling
 * server is worse than a broken page.
 */
(function () {
  'use strict';

  var KEY = 'indico-retry-once';
  var GRACE = 400;      // ms after load, for a straggling script to run

  // Session storage is gone in some private modes, and reading it can throw.
  // Without it there is no way to know whether we have already reloaded, and
  // a reload that cannot count itself is how loops start -- so we do nothing.
  function remember() {
    try { sessionStorage.setItem(KEY, String(Date.now())); return true; }
    catch (e) { return false; }
  }
  function tried() {
    try { return sessionStorage.getItem(KEY) !== null; }
    catch (e) { return true; }
  }
  function forget() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing to undo */ }
  }

  // A resource that failed to load fires an error event that does not bubble,
  // so it is caught on the way down instead.
  var dropped = false;
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'IMG') dropped = true;
  }, true);

  // What the page cannot do without. jQuery is the one that takes the rest of
  // Indico down with it; moment is the next-loudest in the console.
  function missing() {
    return typeof window.jQuery === 'undefined' || typeof window.moment === 'undefined';
  }

  window.addEventListener('load', function () {
    window.setTimeout(function () {
      if (!dropped && !missing()) { forget(); return; }   // a clean load clears the mark
      if (tried()) return;                                // already had our one go
      if (!remember()) return;
      window.location.reload();
    }, GRACE);
  });
})();
