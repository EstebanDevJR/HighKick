import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import SearchPanel from "@/components/SearchPanel";
import { searchEverything } from "@/lib/feeds";
import { getT } from "@/lib/i18n/server";
import type { SearchResults } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const [{ t }, { q }] = await Promise.all([getT(), searchParams]);
  const query = typeof q === "string" ? q.trim().slice(0, 64) : "";
  return {
    title: query ? `“${query}”` : t("nav.search"),
    robots: { index: false },
  };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const [{ t }, { q }] = await Promise.all([getT(), searchParams]);
  const query = typeof q === "string" ? q.trim().slice(0, 64) : "";

  // Server-rendering the first results makes /search?q= links shareable
  // and useful without JavaScript; typing takes over client-side.
  let initialResults: SearchResults | null = null;
  if (query.length >= 2) {
    initialResults = await searchEverything(query).catch(() => null);
  }

  return (
    <PageShell title={t("nav.search")}>
      <SearchPanel initialQuery={query} initialResults={initialResults} autoFocus={!query} />
    </PageShell>
  );
}
