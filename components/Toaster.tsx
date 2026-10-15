"use client";

import { useSyncExternalStore } from "react";
import { KickBoltIcon } from "@/components/icons";
import { dismissToast, getServerToasts, getToasts, subscribeToasts } from "@/lib/toast";

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex justify-center px-4 md:pl-[var(--nav-w)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in pointer-events-auto flex max-w-md items-center gap-3 border border-kick/40 bg-ink/95 px-4 py-2.5 font-mono text-xs text-kick shadow-lg backdrop-blur-md"
        >
          <KickBoltIcon width={12} height={12} className="shrink-0" />
          <span className="text-fog/90">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
              className="ml-1 font-semibold uppercase tracking-wider text-kick hover:underline"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
