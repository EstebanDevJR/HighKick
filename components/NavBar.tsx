"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import {
  CompassIcon,
  GithubIcon,
  HomeIcon,
  KickBoltIcon,
  LibraryIcon,
  SearchIcon,
  SettingsIcon,
} from "@/components/icons";
import type { MessageKey } from "@/lib/i18n/messages";

const ITEMS: { href: string; label: MessageKey; icon: typeof HomeIcon }[] = [
  { href: "/", label: "nav.home", icon: HomeIcon },
  { href: "/explore", label: "nav.explore", icon: CompassIcon },
  { href: "/search", label: "nav.search", icon: SearchIcon },
  { href: "/library", label: "nav.library", icon: LibraryIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/c/") || pathname.startsWith("/g/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Bottom tab bar on phones, slim side rail from md up. Its height/width is
// exposed as --nav-h / --nav-w (globals.css) so full-screen feeds size
// themselves around it.
export default function NavBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 flex h-[var(--nav-h)] items-start justify-around border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                active ? "text-kick" : "text-fog/55 hover:text-fog"
              }`}
            >
              <Icon width={22} height={22} />
              {t(label)}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-50 hidden w-[var(--nav-w)] flex-col items-center gap-2 border-r border-white/5 bg-ink/90 py-4 backdrop-blur-md md:flex"
      >
        <Link
          href="/"
          aria-label={t("nav.homeLabel")}
          className="mb-4 flex h-10 w-10 items-center justify-center bg-kick text-ink"
        >
          <KickBoltIcon width={20} height={20} />
        </Link>
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              title={t(label)}
              aria-label={t(label)}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                active ? "bg-kick/15 text-kick" : "text-fog/60 hover:bg-white/5 hover:text-fog"
              }`}
            >
              <Icon width={22} height={22} />
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2">
          <Link
            href="/settings"
            title={t("nav.settings")}
            aria-label={t("nav.settings")}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              pathname === "/settings" ? "bg-kick/15 text-kick" : "text-fog/60 hover:bg-white/5 hover:text-fog"
            }`}
          >
            <SettingsIcon width={20} height={20} />
          </Link>
          <a
            href="https://github.com/EstebanDevJR/HighKick"
            target="_blank"
            rel="noopener noreferrer"
            title={t("nav.github")}
            aria-label={t("nav.github")}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-fog/50 transition-colors hover:bg-white/5 hover:text-fog"
          >
            <GithubIcon width={18} height={18} />
          </a>
        </div>
      </nav>
    </>
  );
}
