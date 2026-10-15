import { createStore } from "@/lib/store";

export interface Prefs {
  hideMature: boolean;
  autoplayNext: boolean;
  // Caps HLS quality and skips preloading the next clip — matters on mobile
  // data plans, which is how much of Kick's LATAM audience watches.
  dataSaver: boolean;
  volume: number;
  muted: boolean;
}

const DEFAULTS: Prefs = {
  hideMature: false,
  autoplayNext: true,
  dataSaver: false,
  volume: 0.8,
  muted: true,
};

export const prefsStore = createStore<Prefs>({
  key: "prefs",
  fallback: DEFAULTS,
  parse(raw) {
    const o = (raw ?? {}) as Partial<Record<keyof Prefs, unknown>>;
    const volume = typeof o.volume === "number" ? o.volume : DEFAULTS.volume;
    return {
      hideMature: typeof o.hideMature === "boolean" ? o.hideMature : DEFAULTS.hideMature,
      autoplayNext: typeof o.autoplayNext === "boolean" ? o.autoplayNext : DEFAULTS.autoplayNext,
      dataSaver: typeof o.dataSaver === "boolean" ? o.dataSaver : DEFAULTS.dataSaver,
      volume: Math.max(0, Math.min(1, volume)),
      muted: typeof o.muted === "boolean" ? o.muted : DEFAULTS.muted,
    };
  },
});

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefsStore.set((prev) => ({ ...prev, [key]: value }));
}
