import Link from "next/link";
import { KickBoltIcon } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
      <KickBoltIcon width={42} height={42} className="text-glow text-kick" />
      <div>
        <h1 className="font-display text-2xl font-extrabold text-fog">{t("notFound.title")}</h1>
        <p className="mt-1 text-sm text-fog/60">{t("notFound.body")}</p>
      </div>
      <Link
        href="/"
        className="border border-kick bg-kick/10 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-kick transition-colors hover:bg-kick hover:text-ink"
      >
        {t("error.home")}
      </Link>
    </main>
  );
}
