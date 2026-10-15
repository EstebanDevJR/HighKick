"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { useI18n } from "@/components/I18nProvider";
import { onOpenHelp } from "@/lib/commands";
import type { MessageKey } from "@/lib/i18n/messages";

export const SHORTCUTS: { keys: string[]; label: MessageKey }[] = [
  { keys: ["↑", "↓", "J", "K"], label: "help.next" },
  { keys: ["Space"], label: "help.play" },
  { keys: ["L"], label: "help.like" },
  { keys: ["S"], label: "help.share" },
  { keys: ["M"], label: "help.mute" },
  { keys: ["[", "]"], label: "help.volume" },
  { keys: ["←", "→"], label: "help.seek" },
  { keys: ["/", "Ctrl K"], label: "help.search" },
  { keys: ["?"], label: "help.help" },
];

export function ShortcutList() {
  const { t } = useI18n();
  return (
    <dl className="flex flex-col gap-2">
      {SHORTCUTS.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-4 text-sm">
          <dt className="text-fog/80">{t(s.label)}</dt>
          <dd className="flex shrink-0 gap-1">
            {s.keys.map((k) => (
              <kbd
                key={k}
                className="min-w-7 rounded border border-white/15 bg-ink px-1.5 py-0.5 text-center font-mono text-[11px] text-fog/80"
              >
                {k}
              </kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ShortcutsHelp() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenHelp(() => setOpen(true)), []);
  return (
    <Sheet
      open={open}
      title={t("help.title")}
      onClose={() => setOpen(false)}
      closeLabel={t("help.close")}
      placement="center"
    >
      <ShortcutList />
    </Sheet>
  );
}
