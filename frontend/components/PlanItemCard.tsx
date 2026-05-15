import type { FixPlanItem } from "../app/types";

export function confidenceBadge(c: FixPlanItem["confidence"]) {
  switch (c) {
    case "high":   return "bg-[var(--color-brand-navy)]/10 text-[var(--color-brand-navy)] border-[var(--color-brand-navy)]/30";
    case "medium": return "bg-amber-50 text-amber-700 border-amber-300";
    case "low":    return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

export function riskBadge(r: FixPlanItem["risk_level"]) {
  switch (r) {
    case "low":    return "bg-emerald-50 text-emerald-700 border-emerald-300";
    case "medium": return "bg-amber-50 text-amber-700 border-amber-300";
    case "high":   return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

export function effortDots(effort: string): number {
  if (effort.includes("5 min") || effort.includes("< 5")) return 1;
  if (effort.includes("30 min"))                            return 2;
  if (effort.includes("1-2 hour"))                          return 3;
  if (effort.includes("Half day"))                          return 4;
  return 5;
}

export function PlanItemCard({
  item,
  selected,
  onToggle,
  delay,
}: {
  item: FixPlanItem;
  selected: boolean;
  onToggle: () => void;
  delay: number;
}) {
  const dots = effortDots(item.estimated_effort);

  return (
    <div
      className={`bg-[var(--color-brand-surface)] border rounded-xl p-5 transition-all motion-safe:animate-fade-in-up ${
        selected
          ? "border-[var(--color-brand-navy)] ring-1 ring-[var(--color-brand-navy)]/20"
          : "border-[var(--color-brand-line)]"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 mb-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 accent-[var(--color-brand-navy)] cursor-pointer"
          />
          <span className="text-xs font-mono font-semibold text-[var(--color-brand-navy)] bg-[var(--color-brand-navy)]/5 px-2 py-0.5 rounded">
            {item.check_id}
          </span>
        </label>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${confidenceBadge(item.confidence)}`}>
          {item.confidence} confidence
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${riskBadge(item.risk_level)}`}>
          {item.risk_level} risk
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-brand-muted)] flex items-center gap-1">
          Effort:
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i < dots ? "bg-[var(--color-brand-navy)]" : "bg-[var(--color-brand-line)]"}`}
            />
          ))}
        </span>
      </div>

      {/* Issue summary */}
      <p className="text-sm text-[var(--color-brand-ink)] font-medium mb-3">{item.issue_summary}</p>

      {/* Proposed action */}
      <div className="border-t border-[var(--color-brand-line)] pt-3 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand-muted)] mb-1.5">
          Proposed action in Exact Online
        </p>
        <p className="text-sm font-mono text-[var(--color-brand-ink)] leading-relaxed">{item.proposed_action}</p>
      </div>

      {/* Affected accounts + supporting data */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {item.affected_accounts.map((acc) => (
          <span
            key={acc}
            className="text-[10px] font-mono px-2 py-0.5 bg-[var(--color-brand-navy)]/5 text-[var(--color-brand-navy)] rounded border border-[var(--color-brand-navy)]/20"
          >
            {acc}
          </span>
        ))}
      </div>

      {item.supporting_data.length > 0 && (
        <p className="text-[10px] text-[var(--color-brand-muted)]">
          Data: {item.supporting_data.slice(0, 3).join(" · ")}{item.supporting_data.length > 3 ? ` +${item.supporting_data.length - 3} more` : ""}
        </p>
      )}

      <p className="text-[10px] text-[var(--color-brand-muted)] mt-1.5">⏱ {item.estimated_effort}</p>
    </div>
  );
}
