---
title: "Presenter background — σμμ reunion"
layout: bg
# Nested under params deliberately: `url` at the top level is one of Hugo's
# own front matter keys and would move the page to that address.
params:
  # The reunion's own branding, the same set the Indico banner carries.
  theme: light
  lockup: true
  kicker: "USMCC Annual Meeting · Stanford"
  heading: "A Particle Physics<br>Alumni Reunion"
  tagline: "Cocktail hour × Research fair"
  where: "Sunday 13 December 2026 · 4:30–6:30 p.m."
  url: "hepalumni.muoncollider.us"
  # Apple Music, off until both of these are filled in. Shuffle and starting
  # playback from the Full screen button both need MusicKit rather than the
  # plain iframe embed, and MusicKit needs a developer token — a JWT signed
  # with a MusicKit key from an Apple Developer account. See the README.
  # The playlist is its catalogue id, the pl.xxxxxxxx in its share link.
  music_token: ""
  music_playlist: ""
  # The nine hand-drawn lines of the VBF diagram, arising out of the field.
  # false leaves the page as the website's field and nothing else.
  diagram: true
# Unlinked: nothing on the site points here and it stays out of the sitemap.
# It is a screen to put up in the room, not a page of the site.
_build:
  list: never
  render: always
---
