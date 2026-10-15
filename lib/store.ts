// Minimal localStorage-backed store shaped for useSyncExternalStore. All of
// HighKick's personal data (likes, history, follows, preferences) lives in
// the browser on purpose: no accounts, nothing to leak. Each store caches
// its parsed value so snapshots are referentially stable, and syncs across
// tabs through the `storage` event.

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  serverSnapshot(): T;
}

interface StoreOptions<T> {
  key: string;
  fallback: T;
  // Turns whatever JSON is in storage into a valid T; throwing falls back.
  parse: (raw: unknown) => T;
}

export const STORAGE_PREFIX = "highkick:";

export function createStore<T>({ key, fallback, parse }: StoreOptions<T>): Store<T> {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  let cache: T | undefined;
  const listeners = new Set<() => void>();
  let listening = false;

  function read(): T {
    if (cache !== undefined) return cache;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      cache = raw === null ? fallback : parse(JSON.parse(raw));
    } catch {
      cache = fallback;
    }
    return cache;
  }

  function emit() {
    listeners.forEach((l) => l());
  }

  function onStorage(e: StorageEvent) {
    if (e.key === storageKey || e.key === null) {
      cache = undefined;
      emit();
    }
  }

  return {
    get: read,
    serverSnapshot: () => fallback,
    set(next) {
      const value =
        typeof next === "function" ? (next as (prev: T) => T)(read()) : next;
      cache = value;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // storage full or blocked — the value lives for this session only
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!listening && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
        listening = true;
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Everything under the storage prefix, for export/import. Lets people move
// their likes and follows between devices without HighKick holding them.
export function exportAll(): string {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    try {
      data[key] = JSON.parse(window.localStorage.getItem(key) ?? "null");
    } catch {
      // skip unreadable entries
    }
  }
  return JSON.stringify({ app: "highkick", version: 2, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importAll(json: string): number {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, unknown> };
  if (parsed?.app !== "highkick" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("Not a HighKick export");
  }
  let count = 0;
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    window.localStorage.setItem(key, JSON.stringify(value));
    count++;
  }
  return count;
}

export function clearAll(keys?: string[]): void {
  const targets: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    if (!keys || keys.some((k) => key === `${STORAGE_PREFIX}${k}`)) targets.push(key);
  }
  targets.forEach((k) => window.localStorage.removeItem(k));
}
