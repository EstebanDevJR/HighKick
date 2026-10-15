import { NextResponse, type NextRequest } from "next/server";
import { badRequest, parseSlugs, rateLimited } from "@/lib/api";
import { getChannel, type Channel } from "@/lib/kick";

export const dynamic = "force-dynamic";

const MAX_SLUGS = 12;

// Batch channel lookup used for live badges and the "live now" strip. A
// failed lookup reports `null` for that slug instead of failing the batch.
export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const slugs = parseSlugs(req.nextUrl.searchParams.get("slugs"), MAX_SLUGS);
  if (slugs.length === 0) return badRequest("No channels");

  const results = await Promise.all(
    slugs.map((slug) => getChannel(slug).catch(() => null)),
  );
  const channels: Record<string, Channel | null> = {};
  slugs.forEach((slug, i) => {
    channels[slug] = results[i];
  });

  return NextResponse.json(
    { channels },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
