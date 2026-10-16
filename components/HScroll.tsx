"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// A horizontally scrolling row. Touch screens swipe it; a mouse wheel only
// scrolls vertically and the scrollbar is hidden, so pointer devices get
// arrow buttons on whichever side still has more to show.
export default function HScroll({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // 1px of slack: fractional widths can leave scrollLeft just shy of max.
      const max = el.scrollWidth - el.clientWidth - 1;
      setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function page(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }

  const arrow =
    "absolute top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-smoke/90 p-2 text-fog shadow-lg backdrop-blur-md transition-colors hover:border-kick hover:text-kick [@media(hover:hover)]:flex";

  return (
    <div className="relative">
      <ul ref={ref} className={`no-scrollbar overflow-x-auto ${className}`}>
        {children}
      </ul>
      {!edges.start && (
        <button onClick={() => page(-1)} aria-label={t("explore.scrollLeft")} className={`${arrow} -left-2`}>
          <ChevronLeftIcon width={18} height={18} />
        </button>
      )}
      {!edges.end && (
        <button onClick={() => page(1)} aria-label={t("explore.scrollRight")} className={`${arrow} -right-2`}>
          <ChevronRightIcon width={18} height={18} />
        </button>
      )}
    </div>
  );
}
