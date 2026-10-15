// A tiny event bus between the feed's keyboard handler and whichever card
// is active. Cards own their <video> element, so instead of lifting every
// player control into the feed, the feed broadcasts intents and only the
// active card acts on them.

export type ClipCommand =
  | { type: "toggle-play" }
  | { type: "like" }
  | { type: "share" }
  | { type: "seek"; by: number };

const CLIP_EVENT = "highkick:clip-command";
const SEARCH_EVENT = "highkick:open-search";
const HELP_EVENT = "highkick:open-help";

export function sendClipCommand(cmd: ClipCommand): void {
  window.dispatchEvent(new CustomEvent<ClipCommand>(CLIP_EVENT, { detail: cmd }));
}

export function onClipCommand(handler: (cmd: ClipCommand) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ClipCommand>).detail);
  window.addEventListener(CLIP_EVENT, listener);
  return () => window.removeEventListener(CLIP_EVENT, listener);
}

export function openSearch(query = ""): void {
  window.dispatchEvent(new CustomEvent<string>(SEARCH_EVENT, { detail: query }));
}

export function onOpenSearch(handler: (query: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail ?? "");
  window.addEventListener(SEARCH_EVENT, listener);
  return () => window.removeEventListener(SEARCH_EVENT, listener);
}

export function openHelp(): void {
  window.dispatchEvent(new Event(HELP_EVENT));
}

export function onOpenHelp(handler: () => void): () => void {
  window.addEventListener(HELP_EVENT, handler);
  return () => window.removeEventListener(HELP_EVENT, handler);
}

// Global shortcuts must stay out of the way while the user is typing.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
