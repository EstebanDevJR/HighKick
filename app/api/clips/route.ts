import { NextResponse, type NextRequest } from "next/server";
import { badRequest, rateLimited, upstreamFailure } from "@/lib/api";
import { getClips, SLUG_RE, type ClipSort, type ClipTime } from "@/lib/kick";

export const dynamic = "force-dynamic";

const SORTS: ClipSort[] = ["view", "date"];
const TIMES: ClipTime[] = ["day", "week", "month", "all"];

export async function GET(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const cursor = params.get("cursor") ?? "0";
  const sortParam = params.get("sort") ?? "view";
  const timeParam = params.get("time") ?? "day";
  const channel = params.get("channel")?.toLowerCase() || undefined;
  const category = params.get("category")?.toLowerCase() || undefined;

  if (channel && !SLUG_RE.test(channel)) return badRequest("Invalid channel");
  if (category && !SLUG_RE.test(category)) return badRequest("Invalid category");
  if (cursor.length > 64) return badRequest("Invalid cursor");

  const sort = SORTS.includes(sortParam as ClipSort)
    ? (sortParam as ClipSort)
    : "view";
  const time = TIMES.includes(timeParam as ClipTime)
    ? (timeParam as ClipTime)
    : "day";

  try {
    const page = await getClips({ cursor, sort, time, channel, category });
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    return upstreamFailure("clips", err);
  }
}
