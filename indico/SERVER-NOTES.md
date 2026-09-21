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

## If those lines are already in the vhost

They are, but they are not taking effect. As of this writing the response
still says so:

    $ curl -sI https://indico.muoncollider.us/dist/css/main.82dc38ee.css
    HTTP/1.1 200 OK
    Cache-Control: no-cache
    ETag: "1774622227.3972957-485028-3837599890"
    X-Indico-URL: /dist/css/main.82dc38ee.css

Two tells, either one conclusive:

- **`X-Indico-URL`** is set by the Indico application. Apache never adds it.
- **The ETag format.** `1774622227.3972957-485028-3837599890` is Werkzeug's
  `mtime-size-inode`. Apache's own ETags are hex triples that look nothing
  like that.

Four things to check, in the order they usually turn out to be the cause:

1. **`ProxyPass` is winning.** mod_proxy claims the URL before mod_alias gets
   to it, whatever the order of the lines in the file. The fix is an explicit
   exclusion, which must come *before* the general `ProxyPass`:

   ```apache
   ProxyPass /css  !
   ProxyPass /dist !
   ProxyPass /images !
   ProxyPass /fonts !
   ProxyPass /robots.txt !
   ProxyPass / unix:/opt/indico/web/uwsgi.sock|uwsgi://localhost/
   ```

2. **A different vhost is answering.** `apache2ctl -S` lists which
   `ServerName` matches port 443 first; the lines may be in a file that never
   matches this host.

3. **The path is wrong for this installation.** `ls
   /opt/indico/web/static/dist/js/` should list the bundles. If Indico lives
   elsewhere, both `AliasMatch` lines and `XSendFilePath` need that path. (A
   wrong path gives 404s rather than app-served files, so this one shows up
   differently — but it is worth ruling out.)

4. **The config was edited but not reloaded.** `systemctl status apache2`
   shows when it last started; `apache2ctl -t -D DUMP_CONFIG | grep -iE
   "alias|proxypass"` shows what is actually loaded, rather than what is in
   the file on disk.

When it is working, the `curl` above loses `X-Indico-URL`, gains
`Accept-Ranges: bytes`, and its ETag changes shape.

## Rolling back

Comment out the added lines and `systemctl reload apache2`. Nothing else
changed; no Indico data, settings or files are touched by any of this.

## What has already been done on our side

The event banners were 680 KB each and are now about 180 KB, which made the
failures rarer but not rare enough — the banner was never the bulk of the
9.1 MB.

---

# A second, unrelated item: link previews have no image

Pasting an Indico event link into Slack, iMessage or anywhere else shows no
picture. The page does emit the tag, but with a **relative** URL:

    <meta property="og:image" content="/event/124/logo-1833626809.png">

Open Graph requires an absolute URL, and scrapers do not resolve relative ones
against the page they came from, so they show nothing.

This is Indico's own doing rather than a local misconfiguration.
`indico/modules/events/views.py` builds the tag from `event.logo_url`, which is
`url_for(...)` **without** `_external=True`, while the no-logo fallback on the
very next line does pass it — and the model already offers an
`external_logo_url` property used elsewhere for exactly this.

If you would rather not carry a patch, the include that renders these tags can
be overridden in the customization directory. Indico includes it as
`meta.html` (from `indico/web/templates/indico_base.html`), so the override
goes at `<CUSTOMIZATION_DIR>/templates/meta.html`:

```jinja
{%- if page_metadata.og -%}
    {% for key, value in page_metadata.og.items() -%}
        {#- Open Graph needs absolute URLs; Indico emits the event logo relative -#}
        {%- set value = (request.host_url.rstrip('/') ~ value)
                        if value is string and value.startswith('/') else value -%}
        <meta property="og:{{ key }}" content="{{ value|striptags|truncate(500) }}">
    {% endfor %}
{%- endif %}

{%- if page_metadata.json_ld %}
    <script type="application/ld+json">
        {{ page_metadata.json_ld|tojson }}
    </script>
{% endif %}

{%- if page_metadata.keywords %}
    <meta name="keywords" content="{{ page_metadata.keywords|join(',') }}">
{%- endif -%}
```

That is Indico's own template with two lines added, so it keeps working if the
rest of the file changes upstream; check it against the installed copy after
an upgrade.
