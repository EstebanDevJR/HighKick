// Layout for the scrolling (non-feed) pages: Explore, Search, Library and
// Settings. Leaves room for the bottom tab bar on phones.
export default function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-[calc(var(--nav-h)+2rem)] pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fog sm:text-4xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 max-w-xl text-sm text-fog/55">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-kick">{children}</h2>
      {aside}
    </div>
  );
}
