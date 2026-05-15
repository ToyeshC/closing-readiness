interface KpiTileProps {
  label: string;
  value: string;
  caveat?: string | null;
  delay?: number;
}

export function KpiTile({ label, value, caveat, delay = 0 }: KpiTileProps) {
  return (
    <div
      className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-lg p-4 overflow-hidden motion-safe:animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-2 font-medium truncate">
        {label}
      </p>
      <p className="text-xl font-bold text-[var(--color-brand-navy)] tabular-nums leading-none truncate">
        {value}
      </p>
      {caveat && (
        <p className="text-[11px] text-[var(--color-status-warn)] mt-1.5 leading-snug line-clamp-2" title={caveat}>
          {caveat}
        </p>
      )}
    </div>
  );
}
