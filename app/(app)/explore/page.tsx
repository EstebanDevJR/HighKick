import type { Metadata } from "next";
import Link from "next/link";
import ClipTile from "@/components/ClipTile";
import HScroll from "@/components/HScroll";
import LiveFollowing from "@/components/LiveFollowing";
import PageShell, { SectionTitle } from "@/components/PageShell";
import { SearchIcon } from "@/components/icons";
import { getExploreData } from "@/lib/feeds";
import { formatCount } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { clipPath } from "@/lib/kick/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("explore.title"), description: t("explore.subtitle"), alternates: { canonical: "/explore" } };
}

export default async function ExplorePage() {
  const [{ t, locale }, data] = await Promise.all([getT(), getExploreData()]);
  const empty =
    data.categories.length === 0 && data.trendingChannels.length === 0 && data.freshClips.length === 0;

  return (
    <PageShell title={t("explore.title")} subtitle={t("explore.subtitle")}>
      <Link
        href="/search"
        className="mb-8 flex items-center gap-3 rounded-xl border border-white/10 bg-smoke px-4 py-3 text-fog/45 transition-colors hover:border-kick/50"
      >
        <SearchIcon width={18} height={18} />
        <span className="text-sm">{t("search.placeholder")}</span>
      </Link>

      {empty && (
        <p className="mb-8 rounded-xl border border-white/10 bg-smoke px-4 py-3 text-sm text-fog/60">
          {t("explore.unavailable")}
        </p>
      )}

      <LiveFollowing />

      {data.trendingChannels.length > 0 && (
        <section className="mb-10">
          <SectionTitle>{t("explore.trendingChannels")}</SectionTitle>
          <HScroll className="-mx-4 flex gap-3 px-4 pb-1 pt-1">
            {data.trendingChannels.map((c, i) => (
              <li key={c.slug} className="w-28 shrink-0">
                <Link href={`/c/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
                  <span className="relative">
                    <span className="block h-20 w-20 overflow-hidden rounded-full ring-2 ring-kick/60 transition-transform group-hover:scale-105">
                      {c.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-smoke font-display text-2xl font-extrabold text-kick">
                          {c.username.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-kick font-mono text-[11px] font-bold text-ink">
                      {i + 1}
                    </span>
                  </span>
                  <span className="w-full truncate text-sm font-semibold text-fog">{c.username}</span>
                  <span className="font-mono text-[10px] text-fog/45">
                    {t("explore.clipsToday", { n: c.clipCount })} · {formatCount(c.views, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </HScroll>
        </section>
      )}

      {data.categories.length > 0 && (
        <section className="mb-10">
          <SectionTitle>{t("explore.categories")}</SectionTitle>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.categories.slice(0, 24).map((c) => (
              <li key={c.slug}>
                <Link href={`/g/${c.slug}`} className="group flex flex-col gap-1.5">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-smoke ring-1 ring-white/10">
                    {c.banner && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.banner}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </span>
                  <span className="truncate text-xs font-semibold text-fog">{c.name}</span>
                  {c.viewers !== null && (
                    <span className="-mt-1 flex items-center gap-1 font-mono text-[10px] text-fog/45">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {t("explore.viewers", { n: formatCount(c.viewers, locale) })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.trendingCategories.length > 0 && (
        <section className="mb-10">
          <SectionTitle>{t("explore.trendingCategories")}</SectionTitle>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.trendingCategories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/g/${c.slug}`}
                  className="group relative block aspect-video overflow-hidden rounded-lg bg-smoke ring-1 ring-white/10"
                >
                  {c.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover opacity-70 transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
                  <span className="absolute inset-x-2 bottom-2">
                    <span className="block truncate font-display text-sm font-extrabold text-fog">{c.name}</span>
                    <span className="font-mono text-[10px] text-kick">
                      {t("explore.clipsToday", { n: c.clipCount })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.freshClips.length > 0 && (
        <section className="mb-10">
          <SectionTitle>{t("explore.fresh")}</SectionTitle>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {data.freshClips.map((clip) => (
              <li key={clip.id}>
                <ClipTile clip={clip} locale={locale} href={clipPath(clip)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
