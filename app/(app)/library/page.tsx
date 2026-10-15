import type { Metadata } from "next";
import LibraryView, { LibrarySettingsLink } from "@/components/LibraryView";
import PageShell from "@/components/PageShell";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("library.title"), robots: { index: false } };
}

export default async function LibraryPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("library.title")} actions={<LibrarySettingsLink label={t("nav.settings")} />}>
      <LibraryView />
    </PageShell>
  );
}
