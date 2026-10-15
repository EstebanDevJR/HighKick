"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeLabel?: string;
  // "bottom" slides up from the bottom on phones and centers on desktop;
  // "center" is always a centered dialog; "top" hangs from the top (search).
  placement?: "bottom" | "center" | "top";
  wide?: boolean;
}

// Modal sheet rendered into <body> so it escapes the card's overflow and
// stacking context. Handles Escape, backdrop clicks and focus return.
export default function Sheet({
  open,
  title,
  onClose,
  children,
  closeLabel = "Close",
  placement = "bottom",
  wide = false,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // Content first (e.g. the search input), the close button as fallback.
    const selector = "input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])";
    const target =
      contentRef.current?.querySelector<HTMLElement>(selector) ??
      panelRef.current?.querySelector<HTMLElement>(selector) ??
      panelRef.current;
    target?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex justify-center bg-ink/70 backdrop-blur-sm ${
        placement === "bottom"
          ? "items-end sm:items-center"
          : placement === "top"
            ? "items-start pt-[8vh]"
            : "items-center"
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`animate-sheet-in w-full border border-white/10 bg-smoke p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none ${
          wide ? "max-w-2xl" : "max-w-md"
        } ${placement === "bottom" ? "rounded-t-2xl sm:rounded-2xl" : "mx-4 rounded-2xl"}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-fog">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-full p-1.5 text-fog/60 transition-colors hover:bg-white/10 hover:text-fog"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div ref={contentRef}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetAction({
  icon,
  label,
  onClick,
  href,
  external,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  tone?: "default" | "danger" | "kick";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-400 hover:bg-red-500/10"
      : tone === "kick"
        ? "text-kick hover:bg-kick/10"
        : "text-fog hover:bg-white/5";
  const className = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${toneClass}`;
  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={className}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <span className="shrink-0 opacity-80">{icon}</span>
        {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      <span className="shrink-0 opacity-80">{icon}</span>
      {label}
    </button>
  );
}
