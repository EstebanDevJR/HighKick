# HighKick × Kick: integration notes

> **Resumen en español.** HighKick es un feed vertical de clips que manda tráfico *hacia* Kick (cada tarjeta enlaza al clip, al canal y al stream en vivo). Este documento explica qué aporta hoy, cómo está construido para ser respetuoso con la infraestructura de Kick, y tres caminos concretos para integrarlo oficialmente: como superficie "Clips" dentro de Kick, como widget embebible para streamers, o como cliente de una API oficial de clips. Al final está la lista de endpoints que usa hoy y lo que una API oficial desbloquearía.

HighKick is an independent, open-source project and is not affiliated with Kick. This document is written for anyone at Kick evaluating whether — and how — something like it could become part of the platform.

## The problem it solves

Kick's clips are produced at a high rate but have almost no discovery surface: a clip lives on its channel's clips tab and in whatever social post it gets shared to. Most clips are seen a handful of times. Short vertical video is where clip audiences already are, and every one of those views currently happens off-platform.

HighKick is a fast, mobile-first feed of Kick clips whose job is to **turn clip viewers into Kick viewers**:

- every card links to the clip on Kick and to the streamer's channel;
- when the streamer of the clip on screen is live, a LIVE badge takes the viewer into the stream in one tap;
- Explore shows live categories with viewer counts and "live now from channels you follow";
- shared links use Kick's own URL structure and unfurl with rich previews.

## What exists today (v2)

| Area | What it does |
| --- | --- |
| Feeds | MIX (seeded, personalized recommendation deck), FOLLOWING, TOP and NEW by time range, per-channel and per-category feeds |
| Discovery | Explore (live categories, trending streamers and categories derived from clip velocity, fresh clips), global search |
| Retention | Following without accounts, likes, history, "not interested", data saver |
| Distribution | Kick-mirrored URLs, Open Graph cards, share sheet, embeddable player (`/embed/{channel}`) |
| Reach | English, Spanish and Portuguese UI |
| Operations | `/api/health`, per-endpoint circuit breakers, rate limiting, offline app shell |

Nothing personal leaves the browser: likes, history, follows and the taste profile are stored locally. The server only ever sees anonymous slugs for personalization.

## Built to be a good citizen

HighKick reaches Kick's undocumented web API from its server, so it was designed to cost Kick as little as possible:

- **One upstream request per listing per minute per instance**, no matter how many viewers: responses are cached for 60 s (5 min for categories and search) and concurrent identical requests are deduplicated.
- **Concurrency cap** of 6 upstream requests per instance; traffic spikes queue instead of fanning out.
- **No retry on 403** — a Cloudflare rejection is respected, not hammered; transient 5xx/429 get at most two jittered retries.
- **Circuit breakers per endpoint family**: when an endpoint keeps failing, HighKick stops calling it for 30 s and serves last-known-good data.
- **Rate limiting** on HighKick's own API, so it cannot be used as a scraping proxy.
- **Video is never proxied**: playback streams from Kick's CDN directly to the viewer.

## Three ways to integrate

### 1. A "Clips" surface inside Kick

The feed, card and player components are self-contained React and could back a vertical "Clips" tab on kick.com and in the mobile apps. The recommendation logic (`lib/recommend.ts`) is pure and documented; with first-party signals (watch time, follows, chat activity) it would get much better than what an outside project can do with public listings.

### 2. An official embeddable player for streamers

`/embed/{channel}` already lets a streamer put their best clips on their own site, Linktree-style pages or overlays, with every card linking back to Kick. Hosted by Kick (e.g. `kick.com/embed/{channel}/clips`), it becomes a distribution channel for every streamer's website.

### 3. A client of an official clips API

The cleanest path for both sides: HighKick switches from the undocumented web API to an official, documented one. The data layer is isolated in `lib/kick/` (one file per concern: types, normalizers, HTTP client, endpoints), so swapping the source is a contained change.

## Endpoints HighKick uses today

All `GET`, all server-side, all cached as described above.

| Endpoint | Used for | Cache |
| --- | --- | --- |
| `/api/v2/clips?cursor&sort&time` | MIX pools, TOP/NEW | 60 s |
| `/api/v2/channels/{slug}/clips?cursor&sort&time` | channel feeds, Following | 60 s |
| `/api/v2/categories/{slug}/clips?cursor&sort&time` | category feeds | 60 s |
| `/api/v2/clips/{id}` | clip deep links | 60 s |
| `/api/v2/channels/{slug}` | profile strip, live badges | 60 s |
| `/api/v1/subcategories` (fallback `/api/v1/categories/top`) | Explore categories | 5 min |
| `/api/search?searchterm=` | search (best effort) | 5 min |

## What an official clips API would unlock

Ordered by impact:

1. **Clip listings** (global, per channel, per category) with cursors and `sort=view|date` — the core of everything above.
2. **Batch channel status**: live / viewers for up to N channels in one call (powers live badges and "live now" without one request per channel).
3. **Clip velocity**: views over the last hour, to rank "trending now" better than total views.
4. **Language / region on clips**, for language filters (the most requested missing feature).
5. **Webhooks or a feed of new clips**, so caches can be invalidated instead of polled.
6. **OAuth "follow on Kick"**, so following in HighKick follows on Kick too — today follows are local only, by design, because there is no way to do it properly.

## Contact

Open an issue or a discussion on the [repository](https://github.com/EstebanDevJR/HighKick).
