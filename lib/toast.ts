// App-wide toast queue. Kept outside React so any handler (a card, a sheet,
// the settings page) can raise one without prop drilling.

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

export function toast(message: string, action?: Toast["action"], ttlMs = 2400): void {
  const id = nextId++;
  // One at a time reads better on a phone than a stack.
  toasts = [{ id, message, action }];
  emit();
  setTimeout(() => dismissToast(id), action ? ttlMs + 1600 : ttlMs);
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): Toast[] {
  return toasts;
}

const EMPTY: Toast[] = [];
export function getServerToasts(): Toast[] {
  return EMPTY;
}
