"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { AnalysisResult, CheckCorrelation, EarlyWarning, FixPlan, InsightsResult, ReadinessCheck } from "../types";
import { Header } from "../../components/Header";
import { PlanItemCard } from "../../components/PlanItemCard";
import { fetchFixPlan, approveFixPlan, fetchInsights } from "../../lib/api";
import { formatEur } from "../../lib/format";

function typeStyle(type: "FACT" | "ASSUMPTION" | "ADVICE") {
  switch (type) {
    case "FACT":
      return "bg-[var(--color-brand-navy)]/5 text-[var(--color-brand-navy)] border-[var(--color-brand-navy)]/30";
    case "ASSUMPTION":
      return "bg-amber-50 text-amber-800 border-amber-300";
    case "ADVICE":
      return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

function confidenceStyle(conf: "high" | "medium" | "low") {
  switch (conf) {
    case "high":   return "text-[var(--color-brand-navy)]";
    case "medium": return "text-amber-700";
    case "low":    return "text-[var(--color-brand-rose-deep)]";
  }
}

function AiDisclosureBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-[var(--color-brand-navy)]/30 rounded-lg text-xs text-[var(--color-brand-muted)] mb-5 motion-safe:animate-fade-in-up">
      <p>
        <span className="font-semibold text-[var(--color-brand-ink)]">AI-generated output.</span>{" "}
        This analysis was produced by Claude (Anthropic). All outputs require human review before action.
      </p>
      <button
        onClick={onDismiss}
        className="self-start shrink-0 text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] leading-none text-sm cursor-pointer"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function BlockerRow({ check }: { check: ReadinessCheck }) {
  const badgeColor =
    check.status === "blocker"
      ? "bg-[var(--color-status-blocker-bg)] text-[var(--color-status-blocker)] border-[var(--color-status-blocker)]/30"
      : "bg-[var(--color-status-fail-bg)] text-[var(--color-status-fail)] border-[var(--color-status-fail)]/30";

  return (
    <div className="flex items-center gap-3 py-2.5 border-t border-[var(--color-brand-line)] first:border-0">
      {/* Fixed width so BLOCKER and FAIL badges align labels */}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 min-w-[52px] text-center ${badgeColor}`}>
        {check.status.toUpperCase()}
      </span>
      <span className="text-sm text-[var(--color-brand-ink)] flex-1 min-w-0">{check.label}</span>
      <span className="text-sm font-semibold tabular-nums text-[var(--color-brand-ink)] shrink-0 w-28 text-right">
        {check.affected_amount !== null ? formatEur(check.affected_amount) : ""}
      </span>
    </div>
  );
}

function InsightsPanel({
  insights,
  letterCopied,
  onCopyLetter,
}: {
  insights: InsightsResult;
  letterCopied: boolean;
  onCopyLetter: (text: string) => void;
}) {
  const [letterOpen, setLetterOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* What's working */}
      {(insights.whats_working || insights.early_warnings.length > 0) && (
        <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-[var(--color-status-pass)] rounded-xl p-4 motion-safe:animate-fade-in-up">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-status-pass)] mb-2">
            What&apos;s working
          </p>
          {insights.whats_working && (
            <p className="text-sm text-[var(--color-brand-ink)] mb-3">{insights.whats_working}</p>
          )}
          {insights.early_warnings.length > 0 && (
            <div className="space-y-2 border-t border-[var(--color-brand-line)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 mb-2">
                Watch next quarter
              </p>
              {insights.early_warnings.map((w: EarlyWarning) => (
                <div key={w.check_id} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-800 mb-0.5">{w.check_label}</p>
                  <p className="text-xs text-amber-700 mb-1">{w.signal}</p>
                  <p className="text-xs text-[var(--color-brand-muted)]">
                    <span className="font-medium">Recommendation:</span> {w.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Check correlations */}
      {insights.check_correlations.length > 0 && (
        <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-amber-400 rounded-xl p-4 motion-safe:animate-fade-in-up">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 mb-3">
            Related issues
          </p>
          <div className="space-y-3">
            {insights.check_correlations.map((corr: CheckCorrelation, i: number) => (
              <div key={i}>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {corr.check_ids.map((id) => (
                    <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      {id}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--color-brand-ink)]">{corr.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client letter draft */}
      {insights.client_letter_nl && (
        <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl overflow-hidden motion-safe:animate-fade-in-up">
          <button
            onClick={() => setLetterOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer hover:bg-[var(--color-brand-cream)] transition-colors"
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand-navy)]">
              Client letter draft (Nederlands)
            </span>
            <span className="text-xs text-[var(--color-brand-muted)]">{letterOpen ? "▲" : "▼"}</span>
          </button>
          {letterOpen && (
            <div className="border-t border-[var(--color-brand-line)] px-4 py-4">
              <p className="text-sm text-[var(--color-brand-ink)] leading-relaxed whitespace-pre-wrap mb-3">
                {insights.client_letter_nl}
              </p>
              <button
                onClick={() => onCopyLetter(insights.client_letter_nl!)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-brand-navy)] hover:underline cursor-pointer font-medium"
              >
                {letterCopied ? "✓ Copied" : "Copy to clipboard"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FindingsPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [planState, setPlanState] = useState<"idle" | "loading" | "loaded">("idle");
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<number | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [insightsState, setInsightsState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [letterCopied, setLetterCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("analysis_result");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  function toggleItem(checkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      return next;
    });
  }

  async function handleGeneratePlan() {
    setPlanState("loading");
    try {
      const p = await fetchFixPlan();
      setPlan(p);
      setPlanState("loaded");
    } catch {
      setPlanState("idle");
    }
  }

  async function handleGenerateInsights() {
    setInsightsState("loading");
    try {
      const data = await fetchInsights();
      setInsights(data);
      setInsightsState("loaded");
    } catch {
      setInsightsState("error");
    }
  }

  async function handleCopyLetter(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLetterCopied(true);
      setTimeout(() => setLetterCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleApprove() {
    if (!plan || selected.size === 0) return;
    setApproving(true);
    setApproveError(null);
    try {
      await approveFixPlan(plan.plan_id, Array.from(selected), notes);
      setApproved(selected.size);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  if (!result) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="advisory" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[var(--color-brand-muted)]">
            <p className="text-lg mb-3">No readiness report yet.</p>
            <Link href="/" className="text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline text-sm">
              ← Run a check first
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { readiness, advisory_outputs, blocked_reason } = result;
  const blockingChecks = readiness.checks.filter(
    (c) => c.status === "blocker" || c.status === "fail",
  );

  if (approved !== null) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="advisory" />
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
            <Link href="/report" className="text-sm text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline">
              ← Back to report
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
      <Header current="advisory" />

      <div className="max-w-3xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
        {!bannerDismissed && (
          <AiDisclosureBanner onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* ── Insights section (always shown when result is present) ─────── */}
        <div className="mb-6">
          {insightsState === "idle" && (
            <button
              onClick={handleGenerateInsights}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-brand-navy)]/30 text-[var(--color-brand-navy)] text-sm font-medium hover:bg-[var(--color-brand-navy)]/5 cursor-pointer transition-colors"
            >
              Analyse what&apos;s working →
            </button>
          )}
          {insightsState === "loading" && (
            <div className="flex items-center gap-3 py-4 text-[var(--color-brand-muted)]">
              <div className="w-4 h-4 border-2 border-[var(--color-brand-navy)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Analysing findings&hellip;</span>
            </div>
          )}
          {insightsState === "error" && (
            <button
              onClick={handleGenerateInsights}
              className="text-sm text-[var(--color-status-blocker)] hover:underline cursor-pointer"
            >
              Retry insights →
            </button>
          )}
          {insightsState === "loaded" && insights && (
            <InsightsPanel
              insights={insights}
              letterCopied={letterCopied}
              onCopyLetter={handleCopyLetter}
            />
          )}
        </div>

        {readiness.advice_ready ? (
          // Advisory outputs
          <>
            <div className="mb-6 p-4 bg-[var(--color-brand-navy)]/5 border border-[var(--color-brand-navy)]/20 rounded-lg text-sm text-[var(--color-brand-navy)] motion-safe:animate-fade-in-up">
              Data quality checks passed — advisory outputs below are grounded in verified data.
              Each is tagged FACT, ASSUMPTION, or ADVICE with a source citation.
            </div>
            <div className="space-y-3">
              {(advisory_outputs || []).map((output, i) => (
                <div
                  key={i}
                  className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-4 motion-safe:animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded border ${typeStyle(output.type)}`}>
                      {output.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-brand-ink)] mb-2">{output.statement}</p>
                      <p className="text-xs text-[var(--color-brand-muted)]">Source: {output.source}</p>
                      <p className={`text-xs font-medium mt-1 ${confidenceStyle(output.confidence)}`}>
                        Confidence: {output.confidence}
                      </p>
                      {output.source_record_ids && output.source_record_ids.length > 0 && (
                        <p className="text-[10px] text-[var(--color-brand-muted)] mt-1 font-mono">
                          Refs: {output.source_record_ids.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!advisory_outputs || advisory_outputs.length === 0) && (
                <p className="text-[var(--color-brand-muted)] text-sm">
                  No advisory outputs returned — check LangWatch traces.
                </p>
              )}
            </div>
          </>
        ) : (
          // Blocked — show issues and remediation plan CTA
          <>
            <div className="mb-6 p-4 bg-[var(--color-status-blocker-bg)] border border-l-4 border-[var(--color-status-blocker)]/30 border-l-[var(--color-status-blocker)] rounded-lg motion-safe:animate-fade-in-up">
              <p className="text-sm font-semibold text-[var(--color-status-blocker)] mb-1">
                Advisory blocked{blocked_reason ? ` — ${blocked_reason}` : ""}
              </p>
              <p className="text-sm text-[var(--color-brand-ink)]">
                Resolve these issues in Exact Online before a closing advisory can run.
              </p>
            </div>

            {blockingChecks.length > 0 && (
              <div className="mb-6 bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-4">
                {blockingChecks.map((c) => (
                  <BlockerRow key={c.check_id} check={c} />
                ))}
              </div>
            )}

            {planState === "idle" && (
              <div className="mb-8">
                <button
                  onClick={handleGeneratePlan}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] cursor-pointer transition-colors"
                >
                  Generate Remediation Plan →
                </button>
                <p className="text-xs text-[var(--color-brand-muted)] mt-2">
                  Claude proposes specific Exact Online actions · you review and approve
                </p>
              </div>
            )}

            {planState === "loading" && (
              <div className="flex items-center gap-3 py-6 text-[var(--color-brand-muted)]">
                <div className="w-5 h-5 border-2 border-[var(--color-brand-navy)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Generating remediation plan…</span>
              </div>
            )}

            {planState === "loaded" && plan && plan.items.length === 0 && (
              <div className="p-4 rounded-lg border border-[var(--color-status-blocker)]/30 bg-[var(--color-status-blocker-bg)] text-sm text-[var(--color-status-blocker)]">
                Fix plan generation returned no actions — check backend logs and ensure the API key is configured.
              </div>
            )}

            {planState === "loaded" && plan && plan.items.length > 0 && (
              <>
                {/* EU AI Act Art. 13 disclosure — not dismissible on fix plan */}
                <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-[var(--color-brand-navy)]/30 rounded-lg text-xs text-[var(--color-brand-muted)] mb-6">
                  <p>
                    <span className="font-semibold text-[var(--color-brand-ink)]">AI-generated fix plan.</span>{" "}
                    {plan.ai_disclosure}
                  </p>
                </div>

                <p className="text-xs text-[var(--color-brand-muted)] mb-4">
                  {plan.items.length} {plan.items.length === 1 ? "action" : "actions"} proposed
                </p>

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
                <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-5">
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
                  {approveError && (
                    <p className="text-sm text-[var(--color-status-blocker)] mb-3">{approveError}</p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[var(--color-brand-muted)]">
                      {selected.size === 0
                        ? "Select actions to approve above"
                        : `${selected.size} of ${plan.items.length} selected`}
                    </p>
                    <button
                      onClick={handleApprove}
                      disabled={selected.size === 0 || approving}
                      className="px-5 py-2 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {approving ? "Logging…" : `Approve ${selected.size > 0 ? selected.size : ""} selected`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
