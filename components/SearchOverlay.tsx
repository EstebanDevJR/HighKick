"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sheet from "@/components/Sheet";
import SearchPanel from "@/components/SearchPanel";
import { useI18n } from "@/components/I18nProvider";
import { isTypingTarget, onOpenSearch, openHelp } from "@/lib/commands";

// Global command-palette style search: "/" or Ctrl/Cmd+K from anywhere in
// the app. Also owns the "?" shortcut for the help sheet, since both are
// app-wide rather than feed-specific.
export default function SearchOverlay() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const [openedAt, setOpenedAt] = useState(pathname);

  // Navigating away (e.g. picking a result) closes the overlay.
  if (open && openedAt !== pathname) {
    setOpen(false);
  }

  useEffect(
    () =>
      onOpenSearch((q) => {
        setSeed(q);
        setOpenedAt(window.location.pathname);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const palette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (palette || (e.key === "/" && !e.metaKey && !e.ctrlKey)) {
        if (window.location.pathname === "/search") return;
        e.preventDefault();
        setSeed("");
        setOpenedAt(window.location.pathname);
        setOpen(true);
      } else if (e.key === "?" && !document.querySelector("[role='dialog'][aria-modal='true']")) {
        e.preventDefault();
        openHelp();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Sheet
      open={open}
      title={t("nav.search")}
      onClose={() => setOpen(false)}
      closeLabel={t("search.close")}
      placement="top"
      wide
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <SearchPanel key={seed} initialQuery={seed} autoFocus onNavigate={() => setOpen(false)} />
      </div>
    </Sheet>
  );
}
