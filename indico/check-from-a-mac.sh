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
curl -sI --http2 "$HOST/" | head -1
echo "   'HTTP/2 200' is what you want. 'HTTP/1.1 200' means the Protocols"
echo "   line is missing, so a browser opens six connections and competes"
echo "   with itself for the 9 MB this page asks for."
echo
echo "== 3. is the body encoded the way the headers say =================="
hdrs=$(curl -sI -H 'Accept-Encoding: gzip' "$ASSET")
enc=$(printf '%s' "$hdrs" | grep -ic '^content-encoding: gzip')
magic=$(curl -s --raw -H 'Accept-Encoding: gzip' "$ASSET" | head -c 2 | od -An -tx1 | tr -d ' ')
echo "   Content-Encoding: gzip header present? $([ "$enc" -gt 0 ] && echo yes || echo NO)"
echo "   first two bytes of the body: $magic  (1f8b = gzip, anything else = plain)"
echo
if [ "$enc" -eq 0 ] && [ "$magic" = "1f8b" ]; then
  echo "   *** gzipped body with no Content-Encoding header. That is the bug:"
  echo "       a strict client cannot parse it, a lenient one sniffs it and"
  echo "       carries on -- which is exactly Safari failing where Chrome does"
  echo "       not. Look at mod_deflate and anything in front of Apache."
else
  echo "   Encoding looks consistent. If Safari still fails here and Chrome"
  echo "   does not, the likely difference is a dropped keep-alive connection:"
  echo "   Chrome silently retries a request that dies on a reused idle"
  echo "   connection, Safari reports it. Same server fault either way."
fi
