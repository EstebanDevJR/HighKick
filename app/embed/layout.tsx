import Toaster from "@/components/Toaster";

// Embeds render inside other sites' iframes: no app navigation, no global
// search, just the player.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden">
      {children}
      <Toaster />
    </div>
  );
}
