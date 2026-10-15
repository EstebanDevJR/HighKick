import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

// The Kick client is exercised against a scripted fake of impit, so these
// tests cover caching, dedupe, retries and failure handling without the
// network.

type Reply = { status: number; body?: unknown } | Error;
const script = new Map<string, Reply[]>();
const requested: string[] = [];

class FakeImpit {
  async fetch(url: string) {
    requested.push(url);
    const queue = script.get(url) ?? [];
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (!reply) throw new Error(`unscripted request ${url}`);
    if (reply instanceof Error) throw reply;
    await new Promise((r) => setTimeout(r, 5));
    return {
      status: reply.status,
      json: async () => {
        if (typeof reply.body === "string") throw new SyntaxError("not json");
        return reply.body;
      },
    };
  }
}

mock.module("impit", { namedExports: { Impit: FakeImpit } });
const { kickGet, isNotFound, getUpstreamStats } = await import("@/lib/kick/http");

interface Group {
  consecutiveFailures: number;
  breakerOpenUntil: number;
}
const shared = () =>
  (globalThis as unknown as Record<symbol, { groups: Record<string, Group> }>)[Symbol.for("highkick.kick-http")];

let n = 0;
function path() {
  n++;
  return `/api/test/${n}`;
}
const url = (p: string) => `https://kick.com${p}`;
const identity = (b: unknown) => b;
const opts = { group: "clips" } as const;

beforeEach(() => {
  requested.length = 0;
  for (const g of Object.values(shared().groups)) {
    g.consecutiveFailures = 0;
    g.breakerOpenUntil = 0;
  }
});

test("caches parsed responses within the TTL", async () => {
  const p = path();
  script.set(url(p), [{ status: 200, body: { v: 1 } }]);
  let parses = 0;
  const parse = (b: unknown) => {
    parses++;
    return b;
  };
  assert.deepEqual(await kickGet(p, parse, opts), { v: 1 });
  assert.deepEqual(await kickGet(p, parse, opts), { v: 1 });
  assert.equal(requested.length, 1);
  assert.equal(parses, 1);
});

test("concurrent identical requests share one upstream call", async () => {
  const p = path();
  script.set(url(p), [{ status: 200, body: [1, 2] }]);
  const results = await Promise.all([kickGet(p, identity, opts), kickGet(p, identity, opts), kickGet(p, identity, opts)]);
  assert.equal(requested.length, 1);
  for (const r of results) assert.deepEqual(r, [1, 2]);
});

test("a Cloudflare 403 is not retried", async () => {
  const p = path();
  script.set(url(p), [{ status: 403 }]);
  await assert.rejects(kickGet(p, identity, opts), /403/);
  assert.equal(requested.length, 1);
});

test("transient 5xx and network errors are retried", async () => {
  const p = path();
  script.set(url(p), [{ status: 502 }, new Error("socket hang up"), { status: 200, body: { ok: true } }]);
  assert.deepEqual(await kickGet(p, identity, opts), { ok: true });
  assert.equal(requested.length, 3);
});

test("404s resolve to a cached not-found error", async () => {
  const p = path();
  script.set(url(p), [{ status: 404 }]);
  const first = await kickGet(p, identity, opts).catch((e) => e);
  assert.equal(isNotFound(first), true);
  const second = await kickGet(p, identity, opts).catch((e) => e);
  assert.equal(isNotFound(second), true);
  assert.equal(requested.length, 1, "the 404 is cached");
  assert.equal(shared().groups.clips.consecutiveFailures, 0, "a 404 is not an outage");
});

test("a challenge page (200 with HTML) is a failure, not data", async () => {
  const p = path();
  script.set(url(p), [{ status: 200, body: "<html>challenge</html>" }]);
  await assert.rejects(kickGet(p, identity, opts), /non-JSON/);
});

test("stale data is served when Kick fails after the TTL", async () => {
  const p = path();
  script.set(url(p), [{ status: 200, body: { fresh: true } }, { status: 403 }]);
  assert.deepEqual(await kickGet(p, identity, { ...opts, ttlMs: 1 }), { fresh: true });
  await new Promise((r) => setTimeout(r, 10));
  const before = getUpstreamStats().staleServed;
  assert.deepEqual(await kickGet(p, identity, { ...opts, ttlMs: 1 }), { fresh: true });
  assert.equal(getUpstreamStats().staleServed, before + 1);
});

test("a failing endpoint family trips only its own breaker", async () => {
  for (let i = 0; i < 6; i++) {
    const p = path();
    script.set(url(p), [{ status: 403 }]);
    await kickGet(p, identity, { group: "search" }).catch(() => {});
  }
  const stats = getUpstreamStats();
  assert.equal(stats.endpoints.search?.health, "down");

  const blocked = path();
  script.set(url(blocked), [{ status: 200, body: 1 }]);
  requested.length = 0;
  await assert.rejects(kickGet(blocked, identity, { group: "search" }), /circuit open/);
  assert.equal(requested.length, 0, "no request while the breaker is open");

  const clips = path();
  script.set(url(clips), [{ status: 200, body: [1] }]);
  assert.deepEqual(await kickGet(clips, identity, opts), [1], "clips keep flowing");
  assert.equal(getUpstreamStats().health, "ok");
});
