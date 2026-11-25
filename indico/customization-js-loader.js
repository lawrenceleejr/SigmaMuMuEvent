/* <CUSTOMIZATION_DIR>/js/00-sigmamumu-loader.js
 *
 * Indico takes a stylesheet from an event manager, never a script, so the
 * performance guard has to be installed on the server once whatever else is
 * true. What it does not have to do is LIVE on the server: this one line
 * fetches it from the event site, so later changes ship with the site instead
 * of needing the server again.
 *
 * The trade this makes, stated plainly for whoever approves it: a script
 * loaded from hepalumni.muoncollider.us runs with the full privileges of an
 * indico.muoncollider.us page, including the reader's logged-in session. The
 * stylesheet already pulls images from that host, but an image cannot act and
 * a script can. The integrity hash below closes most of that gap -- the
 * browser refuses the file unless its bytes hash to exactly this -- at the
 * cost of needing a new hash whenever the script changes:
 *
 *     openssl dgst -sha384 -binary field-guard.js | openssl base64 -A
 *
 * Drop the integrity attribute and updates need no server access at all, but
 * then whoever controls the event site can run anything on Indico. For a file
 * this small and this stable, copying field-guard.js straight into
 * <CUSTOMIZATION_DIR>/js/ is the quieter choice; this exists for when it is
 * not.
 *
 * async, and silent on failure: the event site being slow or down must never
 * delay or break an Indico page.
 */
(function () {
  'use strict';
  var s = document.createElement('script');
  s.src = 'https://hepalumni.muoncollider.us/js/field-guard.js?v=1';
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.integrity = 'sha384-8Ql7U0vEmdehREuxQIQBGyEpzmETjueyiwzJAN5T1NdDlmv8IUg7hM/iuJbTQLxy';
  s.onerror = function () { /* no field guard today; the page is unaffected */ };
  (document.head || document.documentElement).appendChild(s);
})();
