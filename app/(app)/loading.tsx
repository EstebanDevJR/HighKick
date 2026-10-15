import { KickBoltIcon } from "@/components/icons";

// Shown while a page waits on Kick server-side (the first MIX deck, a
// channel's clips), so navigation feels instant even when Kick is slow.
export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-var(--nav-h))] flex-col items-center justify-center gap-4">
      <KickBoltIcon width={42} height={42} className="text-glow animate-pulse text-kick" />
      <span className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
        <span className="animate-loading-bar block h-full w-1/3 rounded-full bg-kick" />
      </span>
    </div>
  );
}
