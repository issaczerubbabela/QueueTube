# Fixtures

`playlist-page.json` and `playlist-continuation.json` are YouTube playlist data in the shape the
playlist page's `ytInitialData` and the `youtubei/v1/browse` continuation response have, trimmed to
a few videos (one of them unplayable). They were written by hand from that shape, without access
to YouTube. `scripts/e2e/playlist-firefox.mjs` saves a real capture to
`scripts/e2e/.profiles/playlist-capture.json`: trim it and replace `playlist-page.json` with it
to test against the real thing.

`playlist-page-lockup.json` is a real capture (October 2026), trimmed to three videos: YouTube
serves some playlist pages in a newer layout, where each video is a `lockupViewModel` and the next
page's token sits in a `continuationItemViewModel` at the end of the list (a later section carries
a token of its own).
