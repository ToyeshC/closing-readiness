"use client";

import { useState } from "react";
import type { ReadinessCheck, SourceLine } from "../app/types";
import { StatusBadge } from "./StatusBadge";
import { fetchSources } from "../lib/api";
import { formatEur, formatPct } from "../lib/format";

interface CheckCardProps {
  check: ReadinessCheck;
  delay?: number;
}

const STATUS_STYLES: Record<string, { accent: string; bg: string }> = {
  blocker: { accent: "border-l-[var(--color-status-blocker)]", bg: "bg-[var(--color-status-blocker-bg)]" },
  fail:    { accent: "border-l-[var(--color-status-fail)]",    bg: "bg-[var(--color-status-fail-bg)]" },
  warn:    { accent: "border-l-[var(--color-status-warn)]",    bg: "bg-[var(--color-status-warn-bg)]" },
  pass:    { accent: "border-l-[var(--color-status-pass)]",    bg: "bg-[var(--color-status-pass-bg)]" },
};

export function CheckCard({ check, delay = 0 }: CheckCardProps) {
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<SourceLine[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggleSources() {
    if (showSources) { setShowSources(false); return; }
    if (!sources) {
      setLoading(true);
      try { setSources(await fetchSources(check.check_id)); }
      catch { setSources([]); }
      finally { setLoading(false); }
    }
    setShowSources(true);
  }

  const hasSources = check.status !== "pass";
  const styles = STATUS_STYLES[check.status] ?? STATUS_STYLES.pass;

  return (
    <div
      className={`border border-[var(--color-brand-line)] border-l-4 rounded-lg overflow-hidden motion-safe:animate-fade-in-up ${styles.accent}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`px-4 py-3.5 ${styles.bg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={check.status} />
              <span className="text-sm font-medium text-[var(--color-brand-ink)]">
                {check.label}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-brand-muted)] opacity-70">
                {check.check_id}
              </span>
            </div>
            <p className="text-sm text-[var(--color-brand-muted)]">{check.description}</p>
            {check.affected_amount !== null && check.affected_amount !== undefined && (
              <p className="text-sm font-semibold text-[var(--color-brand-ink)] tabular-nums mt-1">
                {formatEur(check.affected_amount)}
              </p>
            )}
            {check.status === "blocker" && (
              <p className="mt-1 text-xs text-[var(--color-status-blocker)] font-medium">
                Fix this to unlock advisory
              </p>
            )}
            {check.status !== "blocker" && check.status !== "pass" && check.score_after_fix !== null && (
              <p className="mt-1 text-xs text-[var(--color-brand-muted)]">
                Fix this → score{" "}
                <span className="font-semibold text-[var(--color-brand-navy)]">
                  {formatPct(check.score_after_fix)}
                </span>
              </p>
            )}
          </div>
          {hasSources && (
            <button
              onClick={toggleSources}
              className="shrink-0 text-xs text-[var(--color-brand-navy)] hover:underline whitespace-nowrap mt-0.5"
            >
              {loading ? "Loading…" : showSources ? "Hide ↑" : "Source ↓"}
            </button>
          )}
        </div>
      </div>

      {showSources && sources && sources.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--color-brand-line)] bg-[var(--color-brand-surface)]">
          <table className="w-full text-xs text-[var(--color-brand-ink)]">
            <thead>
              <tr className="bg-[var(--color-brand-cream)] text-[var(--color-brand-muted)] uppercase tracking-wide text-[10px]">
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Account</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i} className="border-t border-[var(--color-brand-line)] even:bg-[var(--color-brand-cream)]/40">
                  <td className="px-4 py-2 whitespace-nowrap">{s.date}</td>
                  <td className="px-4 py-2 font-mono">{s.account_code}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{formatEur(s.amount)}</td>
                  <td className="px-4 py-2 text-[var(--color-brand-muted)] truncate max-w-xs">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
