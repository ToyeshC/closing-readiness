// Shared brand header across all three screens.
// Full-bleed navy bar, cream wordmark, optional breadcrumb chips, optional
// Exact Online connected pill on the right.

import Link from "next/link";

interface HeaderProps {
  current: "home" | "report" | "advisory" | "fix-plan";
  authenticated?: boolean;
  divisionId?: number | null;
}

const CRUMBS = [
  { key: "home" as const,       label: "Overview",  href: "/" },
  { key: "report" as const,     label: "Report",    href: "/report" },
  { key: "advisory" as const,   label: "Advisory",  href: "/advisory" },
  { key: "fix-plan" as const,   label: "Fix Plan",  href: "/fix-plan" },
];

export function Header({ current, authenticated, divisionId }: HeaderProps) {
  return (
    <header className="bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)]">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between gap-4">

        {/* Wordmark — uses the SVG in public/, falls back to text if it fails */}
        <Link href="/" className="flex items-center gap-3 group">
          <img
            src="/consult-co-logo.svg"
            alt="Consult&Co"
            width={140}
            height={22}
            className="h-5 w-auto"
          />
          <span className="hidden sm:block text-xs text-[var(--color-brand-cream-deep)] opacity-70 border-l border-[var(--color-brand-navy-soft)] pl-3">
            Financial Closing Readiness
          </span>
        </Link>

        {/* Breadcrumb chips + auth pill */}
        <div className="flex items-center gap-2">
          {/* Breadcrumb is hidden on small screens; the user can use back button */}
          <nav className="hidden md:flex items-center gap-1">
            {CRUMBS.map((c, i) => (
              <span key={c.key} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-[var(--color-brand-cream-deep)] opacity-30">/</span>
                )}
                <Link
                  href={c.href}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    current === c.key
                      ? "bg-[var(--color-brand-cream)] text-[var(--color-brand-navy)] font-medium"
                      : "text-[var(--color-brand-cream-deep)] opacity-70 hover:opacity-100"
                  }`}
                >
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>

          {/* Exact Online pill (only when connected) */}
          {authenticated && divisionId && (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-cream)] text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-rose)]" />
              <span className="hidden sm:inline">Connected</span>
              <span className="opacity-70">· {divisionId}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
