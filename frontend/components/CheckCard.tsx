"use client";

// Extracted from the previous inline CheckCard in report/page.tsx.
// Same behavior — lazy-loads source lines on demand — but uses the
// shared StatusBadge and brand colors.

import { useState } from "react";
import type { ReadinessCheck, SourceLine } from "../app/types";
import { StatusBadge } from "./StatusBadge";
import { fetchSources } from "../lib/api";
import { formatEur, formatPct } from "../lib/format";

interface CheckCardProps {
  check: ReadinessCheck;
  delay?: number;
}

export function CheckCard({ check, delay = 0 }: CheckCardProps) {
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<SourceLine[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggleSources() {
    if (showSources) {
      setShowSources(false);
      return;
    }
    if (!sources) {
      setLoading(true);
      try {
        setSources(await fetchSources(check.check_id));
      } catch {
        setSources([]);
      } finally {
        setLoading(false);
      }
    }
    setShowSources(true);
  }

  const hasSources = check.status !== "pass";

  const borderClass =
    check.status === "blocker"
      ? "border-[var(--color-brand-rose)]"
      : check.status === "fail"
      ? "border-amber-200"
      : check.status === "warn"
      ? "border-amber-100"
      : "border-[var(--color-brand-line)]";

  return (
    <div
      className={`bg-white border rounded-lg p-4 motion-safe:animate-fade-in-up ${borderClass}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <StatusBadge status={check.status} />
            <span className="text-sm font-medium text-[var(--color-brand-ink)]">
              {check.label}
            </span>
          </div>

          <p className="text-sm text-[var(--color-brand-muted)] mb-2">
            {check.description}
          </p>

          {check.affected_amount !== null && check.affected_amount !== undefined && (
            <p className="text-sm font-medium text-[var(--color-brand-ink)] tabular-nums">
              Amount: {formatEur(check.affected_amount)}
            </p>
          )}

          {check.status === "blocker" && (
            <p className="mt-1.5 text-xs text-[var(--color-brand-rose-deep)] font-medium">
              Fix this → unlocks advisory
            </p>
          )}
          {check.status !== "blocker" &&
            check.status !== "pass" &&
            check.score_after_fix !== null && (
              <p className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
                Fix this → score goes to{" "}
                <span className="font-semibold text-[var(--color-brand-navy)]">
                  {formatPct(check.score_after_fix)}
                </span>
              </p>
            )}
        </div>

        {hasSources && (
          <button
            onClick={toggleSources}
            className="shrink-0 text-xs text-[var(--color-brand-navy)] hover:text-[var(--color-brand-navy-soft)] underline whitespace-nowrap"
          >
            {loading ? "Loading…" : showSources ? "Hide source" : "Show source"}
          </button>
        )}
      </div>

      {showSources && sources && sources.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-[var(--color-brand-ink)] border-t border-[var(--color-brand-line)]">
            <thead>
              <tr className="text-[var(--color-brand-muted)] uppercase tracking-wide">
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-left py-2 pr-3">Account</th>
                <th className="text-right py-2 pr-3">Amount</th>
                <th className="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i} className="border-t border-[var(--color-brand-cream-deep)]">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{s.date}</td>
                  <td className="py-1.5 pr-3 font-mono">{s.account_code}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
                    {formatEur(s.amount)}
                  </td>
                  <td className="py-1.5 text-[var(--color-brand-muted)] truncate max-w-xs">
                    {s.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
