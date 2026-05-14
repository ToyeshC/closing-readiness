// Single source of truth for status colors + labels across all 3 screens.

import type { ReadinessCheck } from "../app/types";

interface StatusBadgeProps {
  status: ReadinessCheck["status"];
  className?: string;
}

const STYLES: Record<ReadinessCheck["status"], string> = {
  blocker: "bg-[var(--color-brand-rose)]/20 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]",
  fail:    "bg-amber-50 text-amber-800 border-amber-300",
  warn:    "bg-amber-50/60 text-amber-700 border-amber-200",
  pass:    "bg-[var(--color-brand-navy)]/5 text-[var(--color-brand-navy)] border-[var(--color-brand-navy)]/30",
};

const LABELS: Record<ReadinessCheck["status"], string> = {
  blocker: "BLOCKER",
  fail:    "FAIL",
  warn:    "WARN",
  pass:    "PASS",
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded border ${STYLES[status]} ${className}`}
    >
      {LABELS[status]}
    </span>
  );
}
