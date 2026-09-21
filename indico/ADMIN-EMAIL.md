Subject: indico.muoncollider.us — three settings behind the blank-page-on-first-load

Hi —

Following up on the event pages that come up blank or unstyled on a first
visit and work on a reload. I ran three checks from a laptop (not through any
proxy) and all three came back the same way. Raw output at the bottom.

**1. The `/dist` bundles are served by the Python application, not Apache.**
Their responses carry `X-Indico-URL` and an ETag shaped
`1774622227.5572917-895349-3526828796` — Werkzeug's `mtime-size-inode`.
Apache's own ETags are hex and it never sets that header. I understand the
`AliasMatch` lines from Indico's install guide are in the vhost; they are not
taking effect. The usual cause is `ProxyPass` claiming the URL before
mod_alias sees it, which needs explicit exclusions placed *before* the general
rule:

    ProxyPass /css  !
    ProxyPass /dist !
    ProxyPass /images !
    ProxyPass /fonts !
    ProxyPass / unix:/opt/indico/web/uwsgi.sock|uwsgi://localhost/

`apache2ctl -t -D DUMP_CONFIG | grep -iE "alias|proxypass"` will show what is
actually loaded, and `apache2ctl -S` which vhost answers for this host.

**2. Nothing is compressed.** Asked with `Accept-Encoding: gzip`, the server
returns plain text: 895,349 bytes either way. These files gzip by 71–85%
(`common.bundle.js` 3,732 KB → 959 KB), so the 9.1 MB this page pulls on a
cold cache would be about 2 MB:

    a2enmod deflate
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css \
                                  text/javascript application/javascript \
                                  application/json image/svg+xml

This one is independent of the others and is the cheapest win available.

**3. It is HTTP/1.1 only.** Indico's own recommended vhost carries
`Protocols h2 http/1.1`. Over HTTP/1.1 a browser opens six connections and
competes with itself for those 9 MB, which is what makes the largest responses
arrive unfinished.

The symptom is the three of them together: ~9 MB uncompressed, sent from the
application, over six racing connections, with `Cache-Control: no-cache` on
content-hashed filenames that could be cached forever. Safari reports the
dropped responses as "cannot parse response"; Chrome silently retries them, so
it looks fine while paying the same cost.

Happy to test whenever suits. When it is right, the check below loses the
`X-Indico-URL` header, gains `Accept-Ranges: bytes`, and reports far fewer
bytes asking for gzip than for plain.

Thanks —
