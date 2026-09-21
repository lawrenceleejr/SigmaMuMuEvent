# indico.muoncollider.us — assets are served by the application, not Apache

**For whoever administers the Indico server.** Nothing here touches Indico
itself: it is one vhost file, two lines from Indico's own installation guide,
and a restart.

## The symptom

On a first load with an empty cache, the event page frequently comes up blank
or unstyled. Safari's console shows

    Failed to load resource: cannot parse response   …/dist/js/common.70a1cb1a.bundle.js
    Failed to load resource: cannot parse response   …/event/124/logo-….png
    ReferenceError: Can't find variable: $            (× 8)

A reload always fixes it. The `ReferenceError`s are not a second fault — they
are what happens after jQuery's bundle fails to arrive.

## What is actually happening

Every static asset on the page is being served **through uWSGI by the Indico
application** rather than by Apache off disk. Two things prove it:

    $ curl -sI https://indico.muoncollider.us/dist/js/jquery.0838d58a.bundle.js
    HTTP/1.1 200 OK
    Server: Apache/2.4.68 (Debian)
    Cache-Control: no-cache                  ← on a content-hashed filename
    X-Indico-URL: /dist/js/jquery.0838d58a.bundle.js   ← the app answered this
    Content-Length: 895349

`X-Indico-URL` is set by Indico's WSGI app; Apache does not add it. And
`Cache-Control: no-cache` on a file whose name contains its own content hash
means every visitor revalidates every bundle on every visit.

The page pulls **9.1 MB across 30 requests, all of it through the
application**:

| | |
| --- | --- |
| `dist/js/common.70a1cb1a.bundle.js` | 3,732 KB |
| `dist/js/mathjax.da45f93e.bundle.js` | 1,106 KB |
| `dist/js/jquery.0838d58a.bundle.js` | 874 KB |
| `dist/css/semantic-ui.03304b73.css` | 799 KB |
| `dist/js/react.a45253ab.bundle.js` | 723 KB |
| `dist/css/main.82dc38ee.css` | 474 KB |
| …24 more | |
| **total** | **9,117 KB** |

On a cold cache the browser opens its connections and asks for all of it at
once. Those requests occupy uWSGI workers that should be rendering pages, and
the largest responses are the ones that come back unfinished. HTTP/1.1 makes
it worse: six connections competing rather than one multiplexed stream.

## The fix: the AliasMatch lines from Indico's install guide

Indico's own Apache vhost (docs.getindico.io → Installation → Production →
Apache) contains these, and this server's vhost does not:

```apache
AliasMatch "^/(images|fonts)(.*)/(.+?)(__v[0-9a-f]+)?\.([^.]+)$" "/opt/indico/web/static/$1$2/$3.$5"
AliasMatch "^/(css|dist|images|fonts)/(.*)$" "/opt/indico/web/static/$1/$2"
Alias /robots.txt /opt/indico/web/static/robots.txt
```

They go **before** the `ProxyPass / unix:…uwsgi.sock` line, since Apache takes
the first match. The upstream vhost also has, in the same file:

```apache
Protocols h2 http/1.1        # HTTP/2, at the top of the VirtualHost

XSendFile on                 # needed for attachments
XSendFilePath /opt/indico

<Directory /opt/indico>
    AllowOverride None
    Require all granted
</Directory>
```

Adjust `/opt/indico` if this installation lives elsewhere — `grep -i static
/opt/indico/etc/indico.conf` and the `STATIC_FILE_METHOD` setting will say.

### While you are in the file

The `/dist` filenames are content-hashed by webpack: `common.70a1cb1a.bundle.js`
becomes a different filename whenever its contents change. They can be cached
permanently and never revalidated:

```apache
<LocationMatch "^/dist/">
    Header set Cache-Control "public, max-age=31536000, immutable"
</LocationMatch>
```

That needs `a2enmod headers` if it is not already on.

## Applying it

```shell
a2enmod proxy_uwsgi rewrite ssl xsendfile headers http2
apachectl configtest          # must say "Syntax OK" before anything else
systemctl reload apache2
```

## Checking it worked

```shell
curl -sI https://indico.muoncollider.us/dist/js/jquery.0838d58a.bundle.js
```

- the `X-Indico-URL` header should be **gone** — Apache is answering now, not
  the application
- `Cache-Control` should read `public, max-age=31536000, immutable`
- the status line should say `HTTP/2 200` if the `Protocols` line went in

```shell
curl -sI https://indico.muoncollider.us/event/124/    # should still be 200, app-served
```

The event page itself must keep coming from uWSGI: if that 404s, an
`AliasMatch` is too greedy and is swallowing application routes.

## Rolling back

Comment out the added lines and `systemctl reload apache2`. Nothing else
changed; no Indico data, settings or files are touched by any of this.

## What has already been done on our side

The event banners were 680 KB each and are now about 180 KB, which made the
failures rarer but not rare enough — the banner was never the bulk of the
9.1 MB.
