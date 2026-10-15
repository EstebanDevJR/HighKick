"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { KickBoltIcon } from "@/components/icons";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-[calc(100dvh-var(--nav-h))] flex-col items-center justify-center gap-5 px-8 text-center">
      <KickBoltIcon width={42} height={42} className="text-fog/20" />
      <div>
        <h1 className="font-display text-2xl font-extrabold text-fog">{t("error.title")}</h1>
        <p className="mt-1 text-sm text-fog/60">{t("error.body")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => unstable_retry()}
          className="border border-kick bg-kick/10 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-kick transition-colors hover:bg-kick hover:text-ink"
        >
          {t("error.retry")}
        </button>
        <Link
          href="/"
          className="border border-white/15 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-fog/80 transition-colors hover:border-kick hover:text-kick"
        >
          {t("error.home")}
        </Link>
      </div>
    </main>
  );
}
