import { NextResponse, type NextRequest } from "next/server";
import { badRequest, parsePage, parseSlugs, rateLimited, upstreamFailure } from "@/lib/api";
import { getMixedFeed, getScopedMixFeed } from "@/lib/feeds";
import { SLUG_RE } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const seed = params.get("seed") ?? "";
  const page = parsePage(params.get("page"));

  if (!/^[a-z0-9-]{1,32}$/i.test(seed)) return badRequest("Invalid seed");
  if (page === null) return badRequest("Invalid page");

  // A channel or category turns this into that scope's own shuffled deck.
  const channel = params.get("channel")?.toLowerCase() || undefined;
  const category = params.get("category")?.toLowerCase() || undefined;
  if (channel && !SLUG_RE.test(channel)) return badRequest("Invalid channel");
  if (category && !SLUG_RE.test(category)) return badRequest("Invalid category");

  const favCategories = parseSlugs(params.get("fc"), 5);
  const favChannels = parseSlugs(params.get("fh"), 5);

  try {
    const feed =
      channel || category
        ? await getScopedMixFeed({ channel, category }, seed, page)
        : await getMixedFeed(seed, page, favCategories, favChannels);
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return upstreamFailure("feed", err);
  }
}
