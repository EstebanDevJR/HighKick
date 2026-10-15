import { NextResponse, type NextRequest } from "next/server";
import { badRequest, rateLimited, upstreamFailure } from "@/lib/api";
import { searchEverything } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length > 64) return badRequest("Query too long");

  try {
    const results = await searchEverything(q);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    return upstreamFailure("search", err);
  }
}
