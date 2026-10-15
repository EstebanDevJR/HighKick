import NavBar from "@/components/NavBar";
import SearchOverlay from "@/components/SearchOverlay";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import Toaster from "@/components/Toaster";

// Everything except embeds lives in this shell: navigation, global search,
// the shortcuts sheet and toasts.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-dvh md:pl-[var(--nav-w)]">
      {children}
      <NavBar />
      <SearchOverlay />
      <ShortcutsHelp />
      <Toaster />
    </div>
  );
}
