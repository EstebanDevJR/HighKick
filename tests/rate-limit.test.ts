import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, RateLimiter } from "@/lib/rate-limit";

test("allows up to the limit per window, then rejects with Retry-After", () => {
  const limiter = new RateLimiter(3, 10_000);
  const t0 = 1_000_000;
  assert.equal(limiter.check("ip", t0).remaining, 2);
  limiter.check("ip", t0 + 1);
  assert.equal(limiter.check("ip", t0 + 2).ok, true);
  const blocked = limiter.check("ip", t0 + 2_500);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSec, 8);
});

test("windows are per key and reset after they elapse", () => {
  const limiter = new RateLimiter(1, 1_000);
  assert.equal(limiter.check("a", 0).ok, true);
  assert.equal(limiter.check("a", 10).ok, false);
  assert.equal(limiter.check("b", 10).ok, true);
  assert.equal(limiter.check("a", 1_000).ok, true);
});

test("memory stays bounded under many distinct keys", () => {
  const limiter = new RateLimiter(5, 60_000, 100);
  for (let i = 0; i < 1_000; i++) limiter.check(`ip-${i}`, i);
  // @ts-expect-error -- peeking at the private map for the bound
  assert.ok(limiter.windows.size <= 100);
});

test("client key prefers the first forwarded address", () => {
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" })), "1.1.1.1");
  assert.equal(clientKey(new Headers({ "x-real-ip": "2.2.2.2" })), "2.2.2.2");
  assert.equal(clientKey(new Headers()), "anonymous");
});
