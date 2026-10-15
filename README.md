# ⚡ HighKick

**English** · [Español](#-highkick-español)

An open-source vertical clip feed for [Kick.com](https://kick.com).

Streamers on Kick generate great clips every day, but there's no obvious place to discover them — so most clips die with a handful of views. HighKick gives those moments a second life: a fullscreen, snap-scrolling short-video feed where you can binge the best clips on the platform, follow the streamers you like, and jump straight into their live stream on Kick.

## What's new in v2

- 🛡️ **New Kick client** — `got-scraping` reached end of life; HighKick now uses [`impit`](https://github.com/apify/impit) behind a hardened data layer (shared cache, stale-if-error, request dedupe, retries, per-endpoint circuit breakers, rate limiting)
- 👥 **Following, without accounts** — follow streamers from any clip and get a FOLLOWING tab with their newest clips
- 🧭 **Explore** — live categories with viewer counts, today's trending streamers, the most-clipped categories and the freshest clips
- 🔍 **Search** — streamers, categories and clip titles from anywhere (`/` or `Ctrl K`)
- 🔴 **Live badges** — when the streamer of the clip you're watching is live, one tap takes you into the stream on Kick
- 🔗 **Kick-mirrored links** — `kick.com/xqc/clips/clip_…` → swap the domain and it opens in HighKick (rich link previews included)
- 🧩 **Embeddable player** — streamers can put a vertical player of their clips on their own site
- 📚 **Library** — liked clips, watch history and followed channels, with a full-screen "play all"
- 🌎 **English, Español, Português** — picked from your browser, switchable in Settings
- 📶 **Data saver**, "not interested", export/import of your data, offline app shell, keyboard shortcuts, accessibility and SEO improvements

See the [CHANGELOG](CHANGELOG.md) for the full list.

## Features

- 📱 **Fullscreen vertical feed** — snap scrolling, autoplay, one clip at a time
- 🎲 **MIX (default)** — a shuffled recommendation feed that's different on every refresh and learns from what you watch
- 👥 **FOLLOWING** — newest clips from the channels you follow
- 🔥 **TOP / NEW** — most-viewed clips of the last 24h / 7d / 30d / all time, or newest first
- 🎯 **Channel & category feeds** — `/c/{channel}` and `/g/{category}`, with a profile strip (followers, live status, follow button)
- 🧭 **Explore**, 🔍 **Search**, 📚 **Library**, ⚙️ **Settings**
- 🔴 **Live now** — live badges on clips and a "live now from channels you follow" strip
- ❤️ **Double-tap to like**, 📤 **share sheet** (X, WhatsApp, Telegram, Reddit, links, embed code)
- 🙈 **Not interested** in a channel or category (with undo), 🔞 **18+ filter**
- ⏩ **Seek & auto-advance**, 📶 **data saver** (480p cap, no preloading)
- ⌨️ **Keyboard** — `↑` `↓` / `J` `K` move, `Space` play/pause, `L` like, `S` share, `M` mute, `[` `]` volume, `←` `→` seek, `/` search, `?` help
- 🎞️ **HLS playback** — hls.js everywhere, native HLS on Safari/iOS
- 📲 **Installable PWA** with an offline app shell
- 🔒 **Private by design** — likes, history, follows and preferences live only in your browser; export them as JSON to move devices

## How the MIX feed works

Kick's API only offers deterministic sorts (`view`/`date`), so a naive feed shows the same clips in the same order on every visit. The MIX feed builds a **recommendation deck** instead:

1. Four pools are fetched in parallel (two pages deep for the fast-moving ones): trending **today**, **this week**, **this month**, and the **freshest uploads** (which is how small streamers surface).
2. Each session gets a random **seed**. A seeded PRNG (mulberry32) shuffles every pool deterministically.
3. The deck is dealt by **weighted round-robin** across pools — 40% today's hits, 25% weekly, 15% monthly, 20% brand-new — with duplicates removed.
4. Pagination reuses the same seed, so scrolling stays stable within a session; refreshing deals a new deck. When the deck runs out, the client reshuffles and keeps going, skipping clips you've already seen.
5. Your browser keeps a local **taste profile**: finishing a clip, liking it or following its streamer counts for its channel and category; swiping away in a second counts a little against. The top categories and channels are sent with the seed (never stored server-side) and matching clips are promoted within the deck.

## How it reaches Kick

Kick's clip listings live behind an undocumented API (`kick.com/api/v2/...`) protected by Cloudflare TLS fingerprinting — plain `fetch`/`curl` gets a 403. HighKick's Next.js route handlers call it with [`impit`](https://github.com/apify/impit), which replays a real Chrome TLS + HTTP/2 handshake, and every response goes through a small resilience layer (`lib/kick/http.ts`):

- **60 s cache** shared by every visitor (and by server-rendered pages and API routes alike)
- **stale-if-error** — up to 15 minutes of last-known-good data while Kick is failing
- **in-flight dedupe** and a **concurrency cap**, so traffic spikes don't become request spikes on Kick
- **retries** with backoff for transient errors only (a Cloudflare 403 is never retried)
- **circuit breakers per endpoint family**, so a blocked search endpoint can't take the feed down
- **normalization** of Kick's drifting payloads into HighKick's own types, so a renamed field degrades gracefully instead of crashing the UI
- **per-IP rate limiting** on HighKick's own API, so it can't be used to scrape Kick

The videos themselves are served from Kick's public CDN with open CORS, so playback happens directly in your browser — no video traffic touches the server.

```
Browser ──► /api/* · server-rendered pages (Next.js) ──► lib/kick (impit + cache + breakers) ──► kick.com/api
   │
   └────── hls.js ──► clips.kick.com (direct, CDN)
```

`GET /api/health` reports what the instance has observed (cache hits, failures, breaker state per endpoint) without calling Kick, so uptime monitors can poll it.

## Share links and embeds

**Mirrored URLs.** HighKick uses Kick's own URL layout, so you can swap the domain of any Kick link:

| Kick                                 | HighKick                                   |
| ------------------------------------ | ----------------------------------------- |
| `kick.com/{channel}/clips/{clip_id}` | `{highkick}/{channel}/clips/{clip_id}`     |
| `kick.com/{channel}`                 | `{highkick}/{channel}` → channel feed      |
| `kick.com/category/{slug}`           | `{highkick}/category/{slug}` → category feed |

Clip links render rich previews (title, streamer, category, thumbnail) on X, WhatsApp, Discord, etc.

**Embed a streamer's clips** on any site (the share sheet's "Copy embed code" generates this):

```html
<iframe
  src="https://{highkick}/embed/{channel}?clip={clip_id}&sort=view"
  width="360" height="640" style="border:0;border-radius:12px"
  allow="autoplay; fullscreen; picture-in-picture" allowfullscreen>
</iframe>
```

`clip` (optional) starts on that clip; `sort` is `view` (top, default) or `date` (newest). Only `/embed/*` may be framed by other sites.

## Getting started

Requires Node.js 22.12+.

```bash
git clone https://github.com/EstebanDevJR/HighKick
cd HighKick
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and scroll.

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | dev server                                 |
| `npm run build`     | production build                           |
| `npm run lint`      | ESLint                                     |
| `npm run typecheck` | TypeScript, strict                         |
| `npm test`          | unit tests (Node's built-in test runner)   |
| `npm run check`     | all of the above — what CI runs            |

**Deploying.** Any Node host works (Vercel, Railway, Fly, a VPS…). There are no required environment variables. Kick is reached from the server, so hosts whose egress IPs Cloudflare distrusts may see 403s; `impit` honours the standard `HTTPS_PROXY` variable if you need to route through a proxy.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- [Tailwind CSS v4](https://tailwindcss.com)
- [hls.js](https://github.com/video-dev/hls.js) for playback
- [impit](https://github.com/apify/impit) to reach Kick's API

## Project structure

```
app/
  (app)/                   pages inside the app shell (navigation, search, toasts)
    page.tsx               home feed (MIX / FOLLOWING / TOP / NEW)
    c/[slug]/              channel feed + profile strip
    g/[slug]/              category feed
    [channel]/clips/[id]/  clip deep link (mirrors kick.com)
    explore/ search/ library/ settings/
  [channel]/ category/     kick.com URL mirrors (redirects)
  embed/[channel]/         iframe-able player
  api/                     feed, clips, following, channels, search, health
  sitemap.ts robots.ts opengraph-image.tsx manifest.ts
components/                Feed, ClipCard, TopBar, NavBar, sheets, search, pages
lib/
  kick/                    types, normalizers, impit HTTP layer, Kick endpoints
  feeds.ts pools.ts        server-side feed builders (MIX, Following, Explore, search)
  recommend.ts trending.ts pure ranking logic
  library.ts prefs.ts      local likes, history, follows, preferences
  i18n/                    EN / ES / PT messages and locale negotiation
tests/                     unit tests
docs/KICK-INTEGRATION.md   how HighKick could plug into Kick
```

## Contributing

PRs welcome. Run `npm run check` before opening one. Ideas:

- Language filter (needs language data on clips)
- Clip-level comments or reactions (would need Kick's API)
- More locales

## For Kick

HighKick is built to send viewers *to* Kick: every card links to the clip and the channel, live streams are one tap away, and the API layer is deliberately polite (shared caching, rate limits, circuit breakers). [docs/KICK-INTEGRATION.md](docs/KICK-INTEGRATION.md) describes how it could become an official surface and what an official clips API would unlock.

## Disclaimer

HighKick is a fan-made, open-source project. It is **not affiliated with, endorsed by, or connected to Kick** in any way. All clips, usernames, and avatars belong to their creators and are loaded from Kick's own CDN. It uses an undocumented API that may change or break at any time.

## License

[MIT](LICENSE)

---

# ⚡ HighKick (Español)

[English](#-highkick) · **Español**

Un feed vertical de clips de [Kick.com](https://kick.com), de código abierto.

Los streamers de Kick generan clips geniales todos los días, pero no hay un lugar claro donde descubrirlos — la mayoría muere con un puñado de vistas. HighKick les da una segunda vida: un feed de video corto a pantalla completa, con scroll que encaja clip a clip, donde puedes ver lo mejor de la plataforma, seguir a tus streamers y saltar directo a su stream en vivo en Kick.

## Novedades de la v2

- 🛡️ **Nuevo cliente de Kick** — `got-scraping` quedó obsoleto; HighKick ahora usa [`impit`](https://github.com/apify/impit) con una capa de datos reforzada (caché compartida, datos "stale" si Kick falla, deduplicación, reintentos, circuit breakers por endpoint, rate limiting)
- 👥 **Siguiendo, sin cuentas** — sigue streamers desde cualquier clip y obtén una pestaña SIGUIENDO con sus clips más nuevos
- 🧭 **Explorar** — categorías en vivo con espectadores, streamers en tendencia hoy, categorías más clipeadas y los clips más frescos
- 🔍 **Búsqueda** — streamers, categorías y títulos de clips desde cualquier parte (`/` o `Ctrl K`)
- 🔴 **Badges EN VIVO** — si el streamer del clip que ves está en vivo, un toque te lleva a su stream en Kick
- 🔗 **Enlaces espejo de Kick** — `kick.com/xqc/clips/clip_…` → cambia el dominio y se abre en HighKick (con vista previa enriquecida)
- 🧩 **Reproductor embebible** — los streamers pueden poner un reproductor vertical de sus clips en su web
- 📚 **Biblioteca** — clips que te gustaron, historial y canales seguidos, con "reproducir todo"
- 🌎 **English, Español, Português** — detectado desde tu navegador, configurable en Ajustes
- 📶 **Ahorro de datos**, "no me interesa", exportar/importar tus datos, shell offline, atajos de teclado, mejoras de accesibilidad y SEO

Lista completa en el [CHANGELOG](CHANGELOG.md).

## Cómo funciona el feed MIX

La API de Kick solo ofrece ordenamientos deterministas (`view`/`date`), así que un feed ingenuo muestra los mismos clips en el mismo orden en cada visita. El feed MIX construye un **mazo de recomendaciones**:

1. Se descargan cuatro fuentes en paralelo (dos páginas de profundidad en las que más cambian): tendencias de **hoy**, de **la semana**, del **mes** y los **clips más recientes** (así es como los streamers pequeños ganan visibilidad).
2. Cada sesión recibe una **semilla** aleatoria. Un PRNG con semilla (mulberry32) mezcla cada fuente de forma determinista.
3. El mazo se reparte por **round-robin ponderado** — 40% éxitos de hoy, 25% semanales, 15% mensuales, 20% recién subidos — sin duplicados.
4. La paginación reutiliza la semilla, así el scroll es estable dentro de la sesión; refrescar reparte un mazo nuevo. Cuando se agota, el cliente vuelve a mezclar y sigue, saltando lo que ya viste.
5. Tu navegador guarda un **perfil de gustos** local: terminar un clip, darle like o seguir al streamer suma para su canal y categoría; deslizar en un segundo resta un poco. Las categorías y canales favoritos se envían con la semilla (nunca se guardan en el servidor) y los clips que coinciden se adelantan en el mazo.

## Cómo llega a Kick

Los listados de clips están detrás de una API no documentada (`kick.com/api/v2/...`) protegida por fingerprinting TLS de Cloudflare — un `fetch`/`curl` normal recibe 403. Los route handlers de Next.js la consultan con [`impit`](https://github.com/apify/impit), que reproduce un handshake TLS + HTTP/2 real de Chrome, y cada respuesta pasa por una capa de resiliencia (`lib/kick/http.ts`): caché de 60 s compartida, datos "stale" hasta 15 min si Kick falla, deduplicación de peticiones simultáneas, límite de concurrencia, reintentos solo para errores transitorios (un 403 de Cloudflare nunca se reintenta), circuit breakers por familia de endpoints, normalización defensiva de las respuestas y rate limiting por IP.

Los videos se sirven desde el CDN público de Kick, así que la reproducción ocurre directamente en tu navegador — ningún video pasa por el servidor. `GET /api/health` informa del estado observado (caché, fallos, breakers) sin llamar a Kick.

## Enlaces e inserción

Cambia el dominio de cualquier enlace de Kick: `kick.com/{canal}/clips/{id}`, `kick.com/{canal}` y `kick.com/category/{slug}` funcionan igual en HighKick. Para insertar los clips de un streamer en cualquier web, usa "Copiar código para insertar" en el menú de compartir (ver el ejemplo de `<iframe>` en la sección en inglés).

## Primeros pasos

Requiere Node.js 22.12+.

```bash
git clone https://github.com/EstebanDevJR/HighKick
cd HighKick
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) y haz scroll. `npm run check` ejecuta lint, type-check, tests y build (lo mismo que CI).

> **Nota:** se despliega en cualquier host con Node (Vercel, Railway, Fly, un VPS…) sin variables de entorno obligatorias. Si Cloudflare desconfía de las IPs de salida de tu host y ves 403, `impit` respeta la variable estándar `HTTPS_PROXY`.

## Para Kick

HighKick está hecho para llevar espectadores *hacia* Kick: cada tarjeta enlaza al clip y al canal, los streams en vivo están a un toque, y la capa de API es deliberadamente respetuosa (caché compartida, límites, circuit breakers). [docs/KICK-INTEGRATION.md](docs/KICK-INTEGRATION.md) describe cómo podría convertirse en una superficie oficial.

## Aviso legal

HighKick es un proyecto de fans, de código abierto. **No está afiliado, respaldado ni conectado con Kick** de ninguna manera. Todos los clips, nombres de usuario y avatares pertenecen a sus creadores y se cargan desde el propio CDN de Kick. Usa una API no documentada que puede cambiar o romperse en cualquier momento.

## Licencia

[MIT](LICENSE)
