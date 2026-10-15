import { NextResponse } from "next/server";
import { getUpstreamStats } from "@/lib/kick";
import pkg from "@/package.json";

export const dynamic = "force-dynamic";

// Reports what this instance has observed about Kick without making a
// request of its own, so uptime monitors can poll it freely. Returns 503
// only while the circuit breaker is open (Kick has been failing hard).
export function GET() {
  const upstream = getUpstreamStats();
  return NextResponse.json(
    {
      status: upstream.health === "down" ? "degraded" : "ok",
      version: pkg.version,
      uptimeSec: Math.round(process.uptime()),
      upstream,
    },
    {
      status: upstream.health === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
