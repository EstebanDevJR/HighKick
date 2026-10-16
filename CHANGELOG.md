# Changelog

## Unreleased

- **Dead clips are skipped.** Kick still lists clips whose video is gone from its CDN (mostly old ones), which used to spin forever. Upcoming clips are probed and anything the CDN rejects is dropped from every feed and remembered locally; network hiccups never hide a clip.
- **MIX on channel and category pages:** a shuffled, seed-stable deck of that streamer's (or category's) clips next to TOP and NEW.
- English is now the default language for everyone; Spanish and Portuguese are picked in Settings (the browser's `Accept-Language` is no longer used).
- Phones: the time-range chip no longer covers the MIX / TOP / NEW selector — the logo shrinks to the bolt instead.
- Explore: the trending streamers row gets scroll arrows on desktop, where a mouse wheel couldn't move it sideways.
- Search: results stay on screen while the next query loads and the keyboard can't autocorrect the query, so tapping a streamer on a phone reliably opens them.

## 2.0.0

### Kick client and data layer

- **Replaced `got-scraping` (end of life upstream) with [`impit`](https://github.com/apify/impit)**, which replays a real Chrome TLS + HTTP/2 fingerprint. It honours the standard `HTTPS_PROXY` variable.
- New resilience layer (`lib/kick/http.ts`): 60 s LRU cache shared by pages and API routes, stale-if-error (15 min), in-flight request dedupe, concurrency cap, jittered retries for transient errors only (a Cloudflare 403 is never retried), cached 404s, and circuit breakers per endpoint family.
- Kick payloads are normalized into HighKick's own `Clip` / `Channel` / `Category` types (`lib/kick/normalize.ts`). Missing or renamed fields degrade to defaults instead of crashing the UI; only `https` media URLs and well-formed ids reach the page.
- New Kick endpoints: single clip, channel profile with live status, category directory, directory search (best effort).
- New API routes: `/api/following`, `/api/channels`, `/api/search`, `/api/health`. Every Kick-backed route is rate limited per IP.
- MIX pools are two pages deep for the fast-moving sorts, so sessions run dry far less often.

### Discovery

- **Explore** (`/explore`): live categories with viewer counts, today's trending streamers and most-clipped categories (computed from the clip pools at no extra cost), fresh clips, and which followed channels are live.
- **Search** (`/search` and a global overlay on `/` or `Ctrl K`): exact handle lookup, Kick's directory search when it answers, and a local index of trending channels, categories and clip titles. Accent-insensitive, keyboard navigable, with recent searches.
- **Following**: follow streamers from any clip or channel page; a FOLLOWING tab merges their newest clips. No accounts — follows live in the browser.
- **Live badges**: the active clip's streamer is checked (debounced, cached) and a LIVE pill links into the stream on Kick. Channel pages show followers, live status and a "Watch live" button.

### Sharing and embedding

- URLs mirror kick.com: `/{channel}/clips/{id}`, `/{channel}` and `/category/{slug}` work by swapping the domain of a Kick link. Clip pages ship Open Graph / Twitter cards from the clip thumbnail.
- Share sheet: X, WhatsApp, Telegram, Reddit, copy HighKick / Kick links, copy embed code, native share.
- `/embed/{channel}?clip=…&sort=…`: an iframe-able vertical player for streamers' own sites (the only route allowed to be framed).

### Personalization and library

- The taste profile learns from watch time (finishing, quick skips), likes and follows, and decays over time.
- "Not interested" in a channel or category, with undo; manage the list in Settings.
- **Library** (`/library`): liked clips and history (stored as snapshots so they replay without Kick), followed channels, filter and "play all".
- **Settings** (`/settings`): language, auto-advance, data saver, 18+ filter, hidden channels/categories, export / import / erase local data.

### Experience

- App shell: bottom tab bar on phones, side rail on desktop.
- English, Spanish and Portuguese, negotiated from `Accept-Language` or chosen in Settings; locale-aware numbers and relative dates.
- Keyboard: `J`/`K`, `Space`, `L`, `S`, `←`/`→` seek, `/` search, `?` help sheet.
- Data saver caps playback at 480p and skips preloading. Volume and sound preference persist.
- "You're all caught up" end card, loading and error states, reduced-motion support, visible focus rings.

### Platform

- `robots.txt`, dynamic `sitemap.xml` (live categories and trending channels), default Open Graph image, per-page metadata and canonical URLs.
- Offline app shell service worker (static assets cache-first, a few pages network-first).
- Security headers: `nosniff`, referrer policy, permissions policy, HSTS, `frame-ancestors`; `X-Powered-By` removed.
- 41 unit tests on Node's built-in runner (`npm test`), `npm run typecheck`, `npm run check`, and a GitHub Actions workflow.
- Requires Node.js 22.12+.

## 1.x

Initial release: MIX / TOP / NEW feeds, channel and category feeds, HLS playback, likes, watch history, personalized MIX, seek bar, auto-advance, 18+ filter, PWA manifest.
