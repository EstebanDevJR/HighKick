"use client";

import { useRef, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { persistLocale, useI18n } from "@/components/I18nProvider";
import { SectionTitle } from "@/components/PageShell";
import { ShortcutList } from "@/components/ShortcutsHelp";
import { DownloadIcon, GithubIcon, TrashIcon, UploadIcon } from "@/components/icons";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/config";
import { hiddenStore, hideCategory, hideChannel } from "@/lib/library";
import { prefsStore, setPref, type Prefs } from "@/lib/prefs";
import { clearAll, exportAll, importAll } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { MessageKey } from "@/lib/i18n/messages";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-fog">{label}</span>
        {hint && <span className="block text-xs text-fog/45">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-white/15 transition-colors peer-checked:bg-kick peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-kick" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-fog transition-transform peer-checked:translate-x-5 peer-checked:bg-ink" />
      </span>
    </label>
  );
}

type BoolPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

const PLAYBACK: { key: BoolPref; label: MessageKey; hint?: MessageKey }[] = [
  { key: "autoplayNext", label: "settings.autoplayNext" },
  { key: "dataSaver", label: "settings.dataSaver", hint: "settings.dataSaverHint" },
  { key: "hideMature", label: "settings.hideMature" },
];

export default function SettingsView({ version }: { version: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.serverSnapshot);
  const hidden = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, hiddenStore.serverSnapshot);

  function changeLocale(next: Locale) {
    if (next === locale) return;
    persistLocale(next);
    startTransition(() => router.refresh());
  }

  function download() {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `highkick-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    try {
      const count = importAll(await file.text());
      toast(t("settings.imported", { n: count }));
      // Stores cache their parsed values; a reload is the simplest way to
      // make every one of them re-read storage.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      toast(t("settings.importFailed"));
    }
  }

  function eraseEverything() {
    if (!window.confirm(t("settings.confirmClear"))) return;
    clearAll();
    window.location.reload();
  }

  const hiddenChannels = Object.entries(hidden.channels);
  const hiddenCategories = Object.entries(hidden.categories);

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section>
        <SectionTitle>{t("settings.language")}</SectionTitle>
        <div className="flex flex-wrap gap-2" aria-busy={pending}>
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => changeLocale(l)}
              aria-pressed={l === locale}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                l === locale
                  ? "border-kick bg-kick text-ink"
                  : "border-white/10 text-fog/75 hover:border-kick/50 hover:text-fog"
              }`}
            >
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>{t("settings.playback")}</SectionTitle>
        <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-smoke px-4">
          {PLAYBACK.map((p) => (
            <Toggle
              key={p.key}
              label={t(p.label)}
              hint={p.hint ? t(p.hint) : undefined}
              checked={prefs[p.key]}
              onChange={(v) => setPref(p.key, v)}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>{t("settings.hidden")}</SectionTitle>
        {hiddenChannels.length === 0 && hiddenCategories.length === 0 ? (
          <p className="text-sm text-fog/45">{t("settings.hiddenEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {hiddenChannels.length > 0 && (
              <HiddenList
                title={t("settings.channels")}
                items={hiddenChannels.map(([slug, name]) => ({ slug, label: `@${name}` }))}
                actionLabel={t("settings.unhide")}
                onRestore={(slug) => hideChannel({ slug, username: hidden.channels[slug], avatar: null }, false)}
              />
            )}
            {hiddenCategories.length > 0 && (
              <HiddenList
                title={t("settings.categoriesLabel")}
                items={hiddenCategories.map(([slug, name]) => ({ slug, label: name }))}
                actionLabel={t("settings.unhide")}
                onRestore={(slug) => hideCategory({ slug, name: hidden.categories[slug] }, false)}
              />
            )}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>{t("settings.data")}</SectionTitle>
        <p className="mb-3 text-sm text-fog/55">{t("settings.dataNote")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={download}
            className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-fog/85 transition-colors hover:border-kick/50 hover:text-kick"
          >
            <DownloadIcon width={16} height={16} />
            {t("settings.export")}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-fog/85 transition-colors hover:border-kick/50 hover:text-kick"
          >
            <UploadIcon width={16} height={16} />
            {t("settings.import")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={eraseEverything}
            className="flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            <TrashIcon width={16} height={16} />
            {t("settings.clearAll")}
          </button>
        </div>
      </section>

      <section className="hidden md:block">
        <SectionTitle>{t("settings.shortcuts")}</SectionTitle>
        <div className="rounded-2xl border border-white/10 bg-smoke p-4">
          <ShortcutList />
        </div>
      </section>

      <section>
        <SectionTitle>{t("settings.about")}</SectionTitle>
        <p className="mb-3 text-sm text-fog/55">{t("settings.aboutText")}</p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-fog/45">
          <span>HighKick v{version}</span>
          <a
            href="https://github.com/EstebanDevJR/HighKick"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-kick"
          >
            <GithubIcon width={14} height={14} />
            GitHub
          </a>
          <a href="/api/health" target="_blank" rel="noopener noreferrer" className="hover:text-kick">
            /api/health
          </a>
        </div>
      </section>
    </div>
  );
}

function HiddenList({
  title,
  items,
  actionLabel,
  onRestore,
}: {
  title: string;
  items: { slug: string; label: string }[];
  actionLabel: string;
  onRestore: (slug: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs text-fog/45">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.slug}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-smoke py-1 pl-3 pr-1 text-sm text-fog/80"
          >
            {item.label}
            <button
              onClick={() => onRestore(item.slug)}
              className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-kick hover:bg-kick/10"
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
