// Fixed-window limiter keyed by client IP. HighKick's API routes are a thin
// proxy in front of Kick, so an unthrottled scraper hitting HighKick would
// effectively be scraping Kick through us. This is per server instance (no
// shared store by design), which is enough to blunt abuse without adding
// infrastructure.

interface Window {
  start: number;
  count: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, w);
      this.evict(now);
    }
    w.count++;
    const ok = w.count <= this.limit;
    return {
      ok,
      limit: this.limit,
      remaining: Math.max(0, this.limit - w.count),
      retryAfterSec: ok ? 0 : Math.ceil((w.start + this.windowMs - now) / 1000),
    };
  }

  private evict(now: number) {
    if (this.windows.size <= this.maxKeys) return;
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs || this.windows.size > this.maxKeys) {
        this.windows.delete(key);
      }
      if (this.windows.size <= this.maxKeys) break;
    }
  }
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "anonymous";
}
