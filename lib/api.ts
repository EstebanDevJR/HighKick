import { NextResponse, type NextRequest } from "next/server";
import { clientKey, RateLimiter } from "@/lib/rate-limit";
import { SLUG_RE } from "@/lib/kick/types";

// Shared plumbing for the /api route handlers.

// Generous for a human scrolling (each page is 20 clips, plus a live-status
// lookup per clip watched) and for carrier-grade NAT, tight for a bot.
// Kept on globalThis so every route handler bundle counts against the same
// window instead of each getting its own budget.
const LIMITER_KEY = Symbol.for("highkick.rate-limiter");
const globalLimiter = globalThis as typeof globalThis & { [LIMITER_KEY]?: RateLimiter };
const limiter = (globalLimiter[LIMITER_KEY] ??= new RateLimiter(240, 60_000));

export function rateLimited(req: NextRequest): NextResponse | null {
  const result = limiter.check(clientKey(req.headers));
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Slow down a little." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function upstreamFailure(route: string, err: unknown): NextResponse {
  console.error(`[api/${route}]`, err);
  return NextResponse.json(
    { error: "Failed to reach Kick. Try again in a moment." },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

// Slug lists arrive as CSV; anything malformed is dropped rather than
// rejected so a corrupt localStorage profile can't break the feed.
export function parseSlugs(csv: string | null, max: number): string[] {
  if (!csv) return [];
  const out = new Set<string>();
  for (const raw of csv.split(",")) {
    const s = raw.trim().toLowerCase();
    if (SLUG_RE.test(s)) out.add(s);
    if (out.size >= max) break;
  }
  return [...out];
}

export function parsePage(value: string | null, max = 50): number | null {
  const page = Number(value ?? "0");
  return Number.isInteger(page) && page >= 0 && page <= max ? page : null;
}
