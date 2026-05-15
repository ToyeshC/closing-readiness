"use client";

import { useState, useEffect } from "react";
import type { ReadinessCheck, FixPlanItem } from "../app/types";
import { StatusBadge } from "./StatusBadge";
import { fetchSingleCheckFix } from "../lib/api";
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
  const [open, setOpen] = useState(false);
  const [fixState, setFixState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [fixItem, setFixItem] = useState<FixPlanItem | null>(null);

  const hasSources = check.source_lines.length > 0;
  const styles = STATUS_STYLES[check.status] ?? STATUS_STYLES.pass;

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`fix_${check.check_id}`);
      if (cached) {
        setFixItem(JSON.parse(cached));
        setFixState("loaded");
      }
    } catch { /* ignore */ }
  }, [check.check_id]);

  async function handleFix(e: React.MouseEvent) {
    e.stopPropagation();
    setFixState("loading");
    try {
      const item = await fetchSingleCheckFix(check.check_id);
      setFixItem(item);
      setFixState("loaded");
      sessionStorage.setItem(`fix_${check.check_id}`, JSON.stringify(item));
    } catch {
      setFixState("error");
    }
  }

  return (
    <div
      className={`border border-[var(--color-brand-line)] border-l-4 rounded-lg overflow-hidden motion-safe:animate-fade-in-up ${styles.accent}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Main row */}
      <div
        className={`px-4 py-3.5 ${styles.bg} ${hasSources ? "cursor-pointer" : ""}`}
        onClick={hasSources ? () => setOpen((v) => !v) : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={check.status} />

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--color-brand-ink)]">{check.label}</span>
              <span className="text-[10px] font-mono text-[var(--color-brand-muted)] opacity-60 hidden sm:inline">
                {check.check_id}
              </span>
            </div>
            {(open || fixState === "loaded") && (
              <p className="text-xs text-[var(--color-brand-muted)] mt-1">{check.description}</p>
            )}
            {(open || fixState === "loaded") && check.status !== "blocker" && check.status !== "pass" && check.score_after_fix !== null && (
              <p className="text-xs text-[var(--color-brand-muted)] mt-0.5">
                Fix this → score{" "}
                <span className="font-semibold text-[var(--color-brand-navy)]">
                  {formatPct(check.score_after_fix)}
                </span>
              </p>
            )}
          </div>

          {/* Fixed-width amount column — always rendered to keep rows aligned */}
          <span className="text-sm font-semibold tabular-nums text-[var(--color-brand-ink)] hidden sm:block shrink-0 w-28 text-right">
            {check.affected_amount !== null && check.affected_amount !== undefined
              ? formatEur(check.affected_amount)
              : ""}
          </span>

          {/* Fixed-width fix button column — always rendered to keep rows aligned */}
          <div
            className="w-20 text-right shrink-0 hidden sm:flex items-center justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            {check.status !== "pass" && (
              <>
                {fixState === "idle" && (
                  <button
                    onClick={handleFix}
                    className="text-xs text-[var(--color-brand-navy)] hover:underline cursor-pointer px-2 py-1"
                  >
                    Fix this →
                  </button>
                )}
                {fixState === "loading" && (
                  <div className="w-3.5 h-3.5 border-2 border-[var(--color-brand-navy)] border-t-transparent rounded-full animate-spin mx-2" />
                )}
                {fixState === "error" && (
                  <button
                    onClick={handleFix}
                    className="text-xs text-[var(--color-status-blocker)] hover:underline cursor-pointer px-2 py-1"
                  >
                    Retry →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Fixed-width source count column — always rendered to keep rows aligned */}
          <span className="text-[10px] text-[var(--color-brand-muted)] shrink-0 w-8 text-right select-none">
            {hasSources ? (open ? "▲" : `▼ ${check.source_lines.length}`) : ""}
          </span>
        </div>
      </div>

      {/* Inline fix result */}
      {fixState === "loaded" && fixItem && (
        <div className="border-t border-[var(--color-brand-line)] bg-[var(--color-brand-surface)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand-muted)] mb-1.5">
            AI-proposed action
          </p>
          <p className="text-sm font-mono text-[var(--color-brand-ink)] leading-relaxed">{fixItem.proposed_action}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[var(--color-brand-muted)]">
            <span>⏱ {fixItem.estimated_effort}</span>
            <span>· {fixItem.confidence} confidence</span>
            <span>· {fixItem.risk_level} risk</span>
          </div>
        </div>
      )}

      {/* Source lines */}
      {open && check.source_lines.length > 0 && (
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
              {check.source_lines.map((s, i) => (
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
