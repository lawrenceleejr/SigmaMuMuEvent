---
title: "Presenter background"
layout: bg
# Nested under params deliberately: `url` at the top level is one of Hugo's
# own front matter keys and would move the page to that address.
params:
  kicker: "3rd Annual"
  heading: "US Muon Collider<br>Collaboration Meeting"
  where: "Stanford, Dec. 13–16, 2026"
  url: "indico.muoncollider.us/e/usmcc2026"
  # Apple Music, off until both of these are filled in. Shuffle and starting
  # playback from the Full screen button both need MusicKit rather than the
  # plain iframe embed, and MusicKit needs a developer token — a JWT signed
  # with a MusicKit key from an Apple Developer account. See the README.
  # The playlist is its catalogue id, the pl.xxxxxxxx in its share link.
  music_token: ""
  music_playlist: ""
  # The nine hand-drawn lines of the VBF diagram, held still in the middle.
  # false leaves the page as the website's field and nothing else.
  diagram: true
# Unlinked: nothing on the site points here and it stays out of the sitemap.
# It is a screen to put up in the room, not a page of the site.
_build:
  list: never
  render: always
---
