import { Impit } from "impit";

// The only module that talks to Kick. Kick's API sits behind Cloudflare TLS
// fingerprinting, so plain fetch gets a 403; impit (the successor to the
// now-EOL got-scraping) replays a real Chrome TLS + HTTP/2 handshake. It
// also honours the standard HTTPS_PROXY variable, which is the escape hatch
// when a host's egress IPs are distrusted by Cloudflare.
//
// Around that client this layer adds what keeps HighKick fast and polite:
//   - a 60 s TTL cache (shared by every visitor on the instance)
//   - stale-if-error: up to 15 min old data is served while Kick is failing
//   - in-flight dedupe: concurrent identical requests share one upstream call
//   - a concurrency cap, so a traffic spike can't burst Kick with requests
//   - retries with jittered backoff for transient failures only (never 403)
//   - circuit breakers that stop calling a failing endpoint for a while
//     instead of hammering it on every page view

const KICK_ORIGIN = "https://kick.com";
const DEFAULT_TTL_MS = 60_000;
const STALE_MS = 15 * 60_000;
const MAX_ENTRIES = 600;
const MAX_CONCURRENT = 6;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BREAKER_THRESHOLD = 6;
const BREAKER_COOLDOWN_MS = 30_000;

// Breakers are per endpoint family: Kick (or Cloudflare) can block one
// endpoint while others keep working, and a best-effort call like directory
// search failing must never take the clip feed down with it.
export type EndpointGroup = "clips" | "clip" | "channel" | "categories" | "search";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

// Checked by shape rather than instanceof: the error may come from another
// module instance through a shared in-flight promise (see `shared` below).
export function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "UpstreamError" &&
    (err as UpstreamError).status === 404
  );
}

type Entry =
  | { at: number; ok: true; data: unknown }
  | { at: number; ok: false; status: number };

interface GroupState {
  consecutiveFailures: number;
  breakerOpenUntil: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

interface SharedState {
  cache: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
  client: Impit | null;
  active: number;
  waiters: (() => void)[];
  totals: {
    upstreamRequests: number;
    upstreamFailures: number;
    cacheHits: number;
    staleServed: number;
  };
  groups: Partial<Record<EndpointGroup, GroupState>>;
}

// Next.js instantiates this module separately for server-rendered pages and
// for route handlers. Keeping the state on globalThis makes both share one
// cache, one connection pool, one concurrency cap and one set of stats
// instead of hitting Kick twice for the same listing.
const STATE_KEY = Symbol.for("highkick.kick-http");
const globalState = globalThis as typeof globalThis & { [STATE_KEY]?: SharedState };
const shared: SharedState = (globalState[STATE_KEY] ??= {
  cache: new Map(),
  inflight: new Map(),
  client: null,
  active: 0,
  waiters: [],
  totals: { upstreamRequests: 0, upstreamFailures: 0, cacheHits: 0, staleServed: 0 },
  groups: {},
});
const { cache, inflight, totals } = shared;

function group(name: EndpointGroup): GroupState {
  return (shared.groups[name] ??= {
    consecutiveFailures: 0,
    breakerOpenUntil: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  });
}

function getClient(): Impit {
  shared.client ??= new Impit({ browser: "chrome", timeout: REQUEST_TIMEOUT_MS });
  return shared.client;
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (shared.active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => shared.waiters.push(resolve));
  }
  shared.active++;
  try {
    return await fn();
  } finally {
    shared.active--;
    shared.waiters.shift()?.();
  }
}

function remember(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  // Map preserves insertion order and hits are re-inserted, so the first
  // key is always the least recently used.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestOnce(url: string): Promise<unknown> {
  totals.upstreamRequests++;
  let res;
  try {
    res = await getClient().fetch(url, {
      headers: { accept: "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(`Network error: ${message}`, null, true);
  }

  if (res.status === 404) {
    throw new UpstreamError("Not found", 404, false);
  }
  if (res.status !== 200) {
    // 403 is Cloudflare rejecting the fingerprint/IP: retrying from the same
    // host only digs the hole deeper, so it is terminal.
    const retryable = res.status === 429 || res.status >= 500;
    throw new UpstreamError(`Kick responded with ${res.status}`, res.status, retryable);
  }

  try {
    return await res.json();
  } catch {
    // Cloudflare challenge pages come back as 200 HTML.
    throw new UpstreamError("Kick returned a non-JSON body", 200, false);
  }
}

async function requestWithRetry(url: string): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    try {
      return await withSlot(() => requestOnce(url));
    } catch (err) {
      const retryable = err instanceof UpstreamError && err.retryable;
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      attempt++;
      await sleep(350 * 2 ** attempt + Math.random() * 250);
    }
  }
}

function recordSuccess(g: GroupState) {
  g.consecutiveFailures = 0;
  g.breakerOpenUntil = 0;
  g.lastSuccessAt = new Date().toISOString();
}

function recordFailure(g: GroupState, err: unknown) {
  // A 404 is a valid answer (unknown channel/clip), not an outage.
  if (isNotFound(err)) return;
  totals.upstreamFailures++;
  g.consecutiveFailures++;
  g.lastFailureAt = new Date().toISOString();
  g.lastError = err instanceof Error ? err.message : String(err);
  if (g.consecutiveFailures >= BREAKER_THRESHOLD) {
    g.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

export interface KickGetOptions {
  group: EndpointGroup;
  ttlMs?: number;
}

// GETs a Kick API path ("/api/v2/clips?...") and returns the parsed body run
// through `parse`. Parsing happens before caching so the cache holds the
// small normalized shape, not Kick's full payload.
export async function kickGet<T>(
  path: string,
  parse: (body: unknown) => T,
  { group: groupName, ttlMs = DEFAULT_TTL_MS }: KickGetOptions,
): Promise<T> {
  const url = `${KICK_ORIGIN}${path}`;
  const now = Date.now();
  const hit = cache.get(url);
  const g = group(groupName);

  if (hit && now - hit.at < ttlMs) {
    totals.cacheHits++;
    remember(url, hit);
    if (hit.ok) return hit.data as T;
    throw new UpstreamError("Not found", hit.status, false);
  }

  const serveStale = (err: unknown): T => {
    if (hit?.ok && now - hit.at < STALE_MS && !isNotFound(err)) {
      totals.staleServed++;
      return hit.data as T;
    }
    throw err;
  };

  if (g.breakerOpenUntil > now) {
    return serveStale(new UpstreamError("Kick is unavailable (circuit open)", null, false));
  }

  let pending = inflight.get(url) as Promise<T> | undefined;
  if (!pending) {
    pending = (async () => {
      try {
        const data = parse(await requestWithRetry(url));
        recordSuccess(g);
        remember(url, { at: Date.now(), ok: true, data });
        return data;
      } catch (err) {
        recordFailure(g, err);
        if (isNotFound(err)) {
          remember(url, { at: Date.now(), ok: false, status: 404 });
        }
        throw err;
      } finally {
        inflight.delete(url);
      }
    })();
    inflight.set(url, pending);
  }

  try {
    return await pending;
  } catch (err) {
    return serveStale(err);
  }
}

export type UpstreamHealth = "ok" | "degraded" | "down" | "unknown";

function groupHealth(g: GroupState | undefined, now: number): UpstreamHealth {
  if (!g) return "unknown";
  if (g.breakerOpenUntil > now) return "down";
  if (g.consecutiveFailures > 0) return "degraded";
  return g.lastSuccessAt ? "ok" : "unknown";
}

// Overall health follows the clip listings: they're the product. The other
// endpoints only power extras (live badges, search, categories).
export function getUpstreamStats() {
  const now = Date.now();
  const endpoints = Object.fromEntries(
    (Object.entries(shared.groups) as [EndpointGroup, GroupState][]).map(([name, g]) => [
      name,
      { health: groupHealth(g, now), ...g, breakerOpen: g.breakerOpenUntil > now },
    ]),
  );
  return {
    health: groupHealth(shared.groups.clips, now),
    cacheEntries: cache.size,
    inflight: inflight.size,
    activeRequests: shared.active,
    queuedRequests: shared.waiters.length,
    ...totals,
    endpoints,
  };
}
