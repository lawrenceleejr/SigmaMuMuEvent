#!/usr/bin/env bash
# Run this on a machine on the same network as the browser that fails --
# a laptop, not a server, and not through a corporate proxy.
#
#     bash check-from-a-mac.sh
#
# It answers three questions the browser cannot: who serves the bundles,
# whether the connection speaks HTTP/2, and whether the body arrives with the
# encoding its headers claim.
set -u
HOST="https://indico.muoncollider.us"
ASSET="$HOST/dist/js/jquery.0838d58a.bundle.js"

echo "== 1. who answers /dist ============================================="
curl -sI "$ASSET" | grep -iE '^HTTP|^server|^cache-control|^etag|^x-indico|^accept-ranges|^content-length'
echo
echo "   X-Indico-URL present, or an ETag shaped 1774622227.55-895349-35268"
echo "   => the Python application is serving it, and the Alias lines are not"
echo "      in effect. Apache would send Accept-Ranges: bytes and a hex ETag."
echo
echo "== 2. does it speak HTTP/2 =========================================="
# GET, not HEAD: this server answers HEAD / with 400, which says nothing about
# the protocol and looks alarming in a report.
curl -s --http2 -o /dev/null -w '   negotiated: HTTP/%{http_version}\n' "$HOST/"
echo "   '2' is what you want. '1.1' means the Protocols line is missing, so"
echo "   a browser opens six connections and competes with itself for the"
echo "   9 MB this page asks for."
echo
echo "== 3. is anything compressed ======================================="
hdrs=$(curl -sI -H 'Accept-Encoding: gzip' "$ASSET")
enc=$(printf '%s' "$hdrs" | grep -ic '^content-encoding: gzip')
magic=$(curl -s --raw -H 'Accept-Encoding: gzip' "$ASSET" | head -c 2 | od -An -tx1 | tr -d ' ')
echo "   Content-Encoding: gzip header present? $([ "$enc" -gt 0 ] && echo yes || echo NO)"
echo "   first two bytes of the body: $magic  (1f8b = gzip, anything else = plain)"
echo
if [ "$enc" -eq 0 ] && [ "$magic" = "1f8b" ]; then
  echo "   *** gzipped body with no Content-Encoding header: a strict client"
  echo "       cannot parse it. Look at mod_deflate and anything in front."
elif [ "$enc" -eq 0 ]; then
  echo "   *** nothing is compressed. gzip asked for, plain text returned."
  echo "       These files compress by 71-85%: the 9 MB this page pulls would"
  echo "       be about 2 MB. Nothing else on this list is worth as much for"
  echo "       as little."
else
  echo "   Compression is on."
fi
