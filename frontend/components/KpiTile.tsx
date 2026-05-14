// Single ratio tile. Used in the Home executive summary and the Report ratios panel.

interface KpiTileProps {
  label: string;
  value: string;             // pre-formatted (formatEur, formatDays, formatPct, etc.)
  caveat?: string | null;
  delay?: number;            // entrance stagger in ms
}

export function KpiTile({ label, value, caveat, delay = 0 }: KpiTileProps) {
  return (
    <div
      className="bg-white border border-[var(--color-brand-line)] rounded-lg p-4 motion-safe:animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-2">
        {label}
      </p>
      <p className="text-2xl font-semibold text-[var(--color-brand-navy)] tabular-nums">
        {value}
      </p>
      {caveat && (
        <p className="text-xs text-[var(--color-brand-rose-deep)] mt-1.5">
          {caveat}
        </p>
      )}
    </div>
  );
}
