import Link from "next/link";

interface HeaderProps {
  current: "home" | "report" | "advisory" | "fix-plan";
  authenticated?: boolean;
  divisionId?: number | null;
}

const CRUMBS = [
  { key: "home" as const,     label: "Overview",  href: "/" },
  { key: "report" as const,   label: "Report",    href: "/report" },
  { key: "advisory" as const, label: "Findings",  href: "/advisory" },
];

export function Header({ current, authenticated, divisionId }: HeaderProps) {
  return (
    <header className="bg-[var(--color-brand-surface)] border-b border-[var(--color-brand-line)]">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-6">

        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-brand-navy)] tracking-tight">
            Consult<span className="text-[var(--color-brand-rose-deep)]">&amp;</span>Co
          </span>
          <span className="hidden sm:block text-xs text-[var(--color-brand-muted)] border-l border-[var(--color-brand-line)] pl-3">
            Financial Closing Readiness
          </span>
        </Link>

        {/* Nav + auth */}
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-5">
            {CRUMBS.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className={`text-sm font-semibold pb-0.5 transition-colors ${
                  current === c.key
                    ? "text-[var(--color-brand-navy)] border-b-2 border-[var(--color-brand-navy)]"
                    : "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-navy)]"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </nav>

          {/* Fixed-width container so nav doesn't shift when badge appears/disappears */}
          <div className="min-w-[80px] flex justify-end">
            {authenticated && divisionId && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-status-pass-bg)] text-[var(--color-status-pass)] text-xs font-medium border border-[var(--color-status-pass)]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-pass)]" />
                <span className="hidden sm:inline">Connected</span>
                <span className="opacity-70">· {divisionId}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
