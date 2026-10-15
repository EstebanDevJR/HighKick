import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import SettingsView from "@/components/SettingsView";
import { getT } from "@/lib/i18n/server";
import pkg from "@/package.json";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("settings.title"), robots: { index: false } };
}

export default async function SettingsPage() {
  const { t } = await getT();
  return (
    <PageShell title={t("settings.title")}>
      <SettingsView version={pkg.version} />
    </PageShell>
  );
}
