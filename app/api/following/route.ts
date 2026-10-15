import { NextResponse, type NextRequest } from "next/server";
import { badRequest, parsePage, parseSlugs, rateLimited, upstreamFailure } from "@/lib/api";
import { getFollowingFeed, MAX_FOLLOWED } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const page = parsePage(params.get("page"));
  if (page === null) return badRequest("Invalid page");

  const channels = parseSlugs(params.get("ch"), MAX_FOLLOWED);
  if (channels.length === 0) return badRequest("No channels");

  try {
    const feed = await getFollowingFeed(channels, page);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err) {
    return upstreamFailure("following", err);
  }
}
