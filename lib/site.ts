import { headers } from "next/headers";

// HighKick has no configured domain (no env vars by design), so absolute
// URLs for Open Graph tags and the sitemap are derived from the request,
// which is correct on any host it's deployed to.
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
