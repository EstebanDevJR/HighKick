import { NextResponse, type NextRequest } from "next/server";
import { badRequest, parsePage, parseSlugs, rateLimited, upstreamFailure } from "@/lib/api";
import { getMixedFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const seed = params.get("seed") ?? "";
  const page = parsePage(params.get("page"));

  if (!/^[a-z0-9-]{1,32}$/i.test(seed)) return badRequest("Invalid seed");
  if (page === null) return badRequest("Invalid page");

  const favCategories = parseSlugs(params.get("fc"), 5);
  const favChannels = parseSlugs(params.get("fh"), 5);

  try {
    const feed = await getMixedFeed(seed, page, favCategories, favChannels);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return upstreamFailure("feed", err);
  }
}
