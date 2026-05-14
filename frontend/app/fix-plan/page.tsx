"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { FixPlan, FixPlanItem } from "../types";
import { Header } from "../../components/Header";
import { fetchFixPlan, approveFixPlan } from "../../lib/api";

function confidenceBadge(c: FixPlanItem["confidence"]) {
  switch (c) {
    case "high":   return "bg-[var(--color-brand-navy)]/10 text-[var(--color-brand-navy)] border-[var(--color-brand-navy)]/30";
    case "medium": return "bg-amber-50 text-amber-700 border-amber-300";
    case "low":    return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

function riskBadge(r: FixPlanItem["risk_level"]) {
  switch (r) {
    case "low":    return "bg-emerald-50 text-emerald-700 border-emerald-300";
    case "medium": return "bg-amber-50 text-amber-700 border-amber-300";
    case "high":   return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

function effortDots(effort: string): number {
  if (effort.includes("5 min") || effort.includes("< 5")) return 1;
  if (effort.includes("30 min"))                            return 2;
  if (effort.includes("1-2 hour"))                          return 3;
  if (effort.includes("Half day"))                          return 4;
  return 5; // "Requires accountant review" or unknown
}

function PlanItemCard({
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

export default function FixPlanPage() {
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<number | null>(null);

  useEffect(() => {
    fetchFixPlan()
      .then((p) => {
        setPlan(p);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  function toggleItem(checkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      return next;
    });
  }

  async function handleApprove() {
    if (!plan || selected.size === 0) return;
    setApproving(true);
    try {
      await approveFixPlan(plan.plan_id, Array.from(selected), notes);
      setApproved(selected.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="fix-plan" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[var(--color-brand-muted)]">
            <div className="w-8 h-8 border-2 border-[var(--color-brand-navy)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Generating fix plan…</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    const isNoReport = error.includes("409") || error.includes("No readiness");
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="fix-plan" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <p className="text-sm font-semibold text-[var(--color-brand-rose-deep)] mb-2">
              {isNoReport ? "No readiness report found" : "Failed to generate plan"}
            </p>
            <p className="text-sm text-[var(--color-brand-muted)] mb-4">
              {isNoReport
                ? "Run a readiness check first, then return here to generate a fix plan."
                : error}
            </p>
            <Link
              href="/"
              className="text-sm text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline"
            >
              ← Run a check first
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!plan) return null;

  if (approved !== null) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="fix-plan" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 bg-[var(--color-brand-navy)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <p className="text-base font-semibold text-[var(--color-brand-navy)] mb-2">
              {approved} {approved === 1 ? "action" : "actions"} approved
            </p>
            <p className="text-sm text-[var(--color-brand-muted)] mb-4">
              Approval logged to LangWatch. Execute the approved steps in Exact Online.
            </p>
            <Link
              href="/report"
              className="text-sm text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline"
            >
              ← Back to report
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
      <Header current="fix-plan" />

      <div className="max-w-3xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
        {/* EU AI Act Art. 13 disclosure — not dismissible on this page */}
        <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-[var(--color-brand-navy)]/30 rounded-lg text-xs text-[var(--color-brand-muted)] mb-6">
          <p>
            <span className="font-semibold text-[var(--color-brand-ink)]">AI-generated fix plan.</span>{" "}
            {plan.ai_disclosure}
          </p>
        </div>

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[var(--color-brand-navy)] mb-1">Fix Plan</h1>
          <p className="text-xs text-[var(--color-brand-muted)]">
            {plan.items.length} {plan.items.length === 1 ? "action" : "actions"} proposed
            · Period {plan.period_start} – {plan.period_end}
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {plan.items.map((item, i) => (
            <PlanItemCard
              key={item.check_id}
              item={item}
              selected={selected.has(item.check_id)}
              onToggle={() => toggleItem(item.check_id)}
              delay={i * 60}
            />
          ))}
        </div>

        {/* Approval panel */}
        <div className="bg-[var(--color-brand-surface)] border-t border-[var(--color-brand-line)] p-5 sticky bottom-0 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="mb-3">
            <label className="block text-xs font-semibold text-[var(--color-brand-muted)] mb-1.5 uppercase tracking-wide">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context for the audit trail…"
              rows={2}
              className="w-full text-sm border border-[var(--color-brand-line)] rounded px-3 py-2 bg-[var(--color-brand-cream)] text-[var(--color-brand-ink)] placeholder:text-[var(--color-brand-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-navy)] resize-none"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-brand-muted)]">
              {selected.size === 0
                ? "Select actions to approve above"
                : `${selected.size} of ${plan.items.length} selected`}
            </p>
            <button
              onClick={handleApprove}
              disabled={selected.size === 0 || approving}
              className="px-5 py-2 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {approving ? "Logging…" : `Approve ${selected.size > 0 ? selected.size : ""} selected`}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
