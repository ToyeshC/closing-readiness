"use client";

// Home — two-mode page:
//   1. Pre-run (no result in localStorage): connect + date pickers + Run button.
//   2. Post-run (result present): executive summary — score gauge, KPI tiles,
//      top 3 issues, CTAs to report/advisory. A collapsible re-run drawer at
//      the bottom lets the demo re-run live without leaving the page.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalysisResult, ReadinessCheck } from "./types";
import { Header } from "../components/Header";
import { ScoreGauge } from "../components/ScoreGauge";
import { KpiTile } from "../components/KpiTile";
import { StatusBadge } from "../components/StatusBadge";
import { fetchAuthStatus, runReadiness, authRedirectUrl } from "../lib/api";
import { formatEur, formatCompactEur, formatDays, formatPct } from "../lib/format";

export default function Home() {
  const router = useRouter();

  // ── Auth state ───────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [divisionId, setDivisionId] = useState<number | null>(null);

  // ── Period controls (default to last complete calendar year) ─────────────
  const _lastYear = new Date().getFullYear() - 1;
  const [periodStart, setPeriodStart] = useState(`${_lastYear}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${_lastYear}-12-31`);

  // ── Result + UI state ────────────────────────────────────────────────────
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRerun, setShowRerun] = useState(false);

  // Load existing result from localStorage so we land on exec summary on revisit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("analysis_result");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      // Stale/corrupt result — ignore, show pre-run mode.
    }
  }, []);

  // Probe auth status on mount.
  useEffect(() => {
    fetchAuthStatus()
      .then((d) => {
        setAuthenticated(d.authenticated);
        setDivisionId(d.division_id);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  function handleStartOver() {
    localStorage.removeItem("analysis_result");
    setResult(null);
  }

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const r = await runReadiness(periodStart, periodEnd);
      localStorage.setItem("analysis_result", JSON.stringify(r));
      setResult(r);
      setShowRerun(false);
      // Re-probe auth status — the initial mount check can fail if the backend
      // isn't ready yet, leaving the badge stale even when runs succeed.
      fetchAuthStatus()
        .then((d) => { setAuthenticated(d.authenticated); setDivisionId(d.division_id); })
        .catch(() => {});
      // If first run, navigate to /report so the user sees the full detail.
      // On subsequent re-runs from the exec summary, stay on Home.
      if (!result) router.push("/report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
      <Header current="home" authenticated={!!authenticated} divisionId={divisionId} />

      <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
        {result ? (
          <ExecutiveSummary
            result={result}
            onRerun={() => setShowRerun(!showRerun)}
            onStartOver={handleStartOver}
            showRerun={showRerun}
            // Pre-run controls re-rendered inside the drawer
            periodStart={periodStart}
            periodEnd={periodEnd}
            setPeriodStart={setPeriodStart}
            setPeriodEnd={setPeriodEnd}
            loading={loading}
            error={error}
            runCheck={runCheck}
          />
        ) : (
          <PreRun
            authenticated={authenticated}
            divisionId={divisionId}
            periodStart={periodStart}
            periodEnd={periodEnd}
            setPeriodStart={setPeriodStart}
            setPeriodEnd={setPeriodEnd}
            loading={loading}
            error={error}
            runCheck={runCheck}
          />
        )}
      </div>
    </main>
  );
}

// ── Sub-component: pre-run controls ──────────────────────────────────────────

interface PreRunProps {
  authenticated: boolean | null;
  divisionId: number | null;
  periodStart: string;
  periodEnd: string;
  setPeriodStart: (s: string) => void;
  setPeriodEnd: (s: string) => void;
  loading: boolean;
  error: string | null;
  runCheck: () => void;
}

function PreRun({
  authenticated,
  divisionId,
  periodStart,
  periodEnd,
  setPeriodStart,
  setPeriodEnd,
  loading,
  error,
  runCheck,
}: PreRunProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-10 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-brand-navy)] mb-2">
          Closing readiness check
        </h1>
        <p className="text-[var(--color-brand-muted)]">
          Run ten deterministic data-quality checks before letting Claude advise on the books.
        </p>
      </div>

      {/* Data source */}
      <section>
        <h2 className="text-[10px] font-semibold text-[var(--color-brand-muted)] uppercase tracking-widest mb-3">
          Data source
        </h2>
        {authenticated === null ? (
          <p className="text-[var(--color-brand-muted)] text-sm">Checking connection…</p>
        ) : authenticated ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-[var(--color-brand-rose)]" />
              Connected to Exact Online
              {divisionId && (
                <span className="opacity-70 font-normal">· division {divisionId}</span>
              )}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-brand-cream-deep)] text-[var(--color-brand-muted)] text-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--color-brand-muted)]" />
              Not connected — using local files
            </span>
            <a
              href={authRedirectUrl()}
              className="text-sm text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline"
            >
              Connect to Exact Online →
            </a>
          </div>
        )}
      </section>

      {/* Period */}
      <section>
        <h2 className="text-[10px] font-semibold text-[var(--color-brand-muted)] uppercase tracking-widest mb-3">
          Analysis period
        </h2>
        <div className="flex gap-4">
          <DateField label="From" value={periodStart} onChange={setPeriodStart} />
          <DateField label="To"   value={periodEnd}   onChange={setPeriodEnd}   />
        </div>
      </section>

      {/* Run */}
      <section>
        <button
          onClick={runCheck}
          disabled={loading}
          className="w-full bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] py-3.5 px-6 rounded-lg font-medium hover:bg-[var(--color-brand-navy-soft)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {loading ? "Running 10 data quality checks…" : "Run readiness check"}
        </button>
        {error && (
          <div className="mt-4 p-4 bg-[var(--color-brand-rose)]/10 border border-[var(--color-brand-rose)] rounded-lg text-[var(--color-brand-rose-deep)] text-sm">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sub-component: post-run executive summary ────────────────────────────────

interface ExecSummaryProps {
  result: AnalysisResult;
  onRerun: () => void;
  onStartOver: () => void;
  showRerun: boolean;
  // Re-run drawer needs the same period+run controls as PreRun
  periodStart: string;
  periodEnd: string;
  setPeriodStart: (s: string) => void;
  setPeriodEnd: (s: string) => void;
  loading: boolean;
  error: string | null;
  runCheck: () => void;
}

function ExecutiveSummary({
  result,
  onRerun,
  onStartOver,
  showRerun,
  periodStart,
  periodEnd,
  setPeriodStart,
  setPeriodEnd,
  loading,
  error,
  runCheck,
}: ExecSummaryProps) {
  const { readiness } = result;
  const ratios = readiness.ratios;

  // Top blocker by amount, then top 3 non-pass issues (blocker first, then fail, then warn).
  const ranked = readiness.checks
    .filter((c) => c.status !== "pass")
    .sort(severitySort)
    .slice(0, 3);

  const topBlocker = readiness.checks.find((c) => c.status === "blocker") || null;

  return (
    <div className="space-y-10">
      {/* Score + status hero */}
      <section className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 items-center motion-safe:animate-fade-in-up">
        <ScoreGauge score={readiness.overall_score} size={180} />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-1">
            Status
          </p>
          <p className="text-2xl font-semibold text-[var(--color-brand-navy)] mb-3">
            {readiness.advice_ready ? "Advisory ready" : "Advisory blocked"}
          </p>
          {topBlocker ? (
            <p className="text-sm text-[var(--color-brand-muted)] max-w-xl">
              <span className="font-medium text-[var(--color-brand-ink)]">
                {formatEur(topBlocker.affected_amount)}
              </span>{" "}
              in {topBlocker.label.toLowerCase()} — blocker. Fix this to unlock Claude advisory.
            </p>
          ) : readiness.advice_ready ? (
            <p className="text-sm text-[var(--color-brand-muted)] max-w-xl">
              All blockers cleared. Claude can run a closing advisory on this period.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-brand-muted)] max-w-xl">
              Score below the {formatPct(0.6)} threshold. Resolve the failing checks to enable advisory.
            </p>
          )}
          <p className="text-xs text-[var(--color-brand-muted)] mt-3">
            Period: {periodStart} → {periodEnd}
          </p>
        </div>
      </section>

      {/* Ratios */}
      {ratios && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
            Financial ratios
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiTile
              label="DSO"
              value={ratios.dso_days.value !== null ? formatDays(ratios.dso_days.value) : "—"}
              caveat={!ratios.dso_days.reliable ? ratios.dso_days.note : null}
              delay={0}
            />
            <KpiTile
              label="DPO"
              value={ratios.dpo_days.value !== null ? formatDays(ratios.dpo_days.value) : "—"}
              caveat={!ratios.dpo_days.reliable ? ratios.dpo_days.note : null}
              delay={60}
            />
            <KpiTile
              label="Working capital"
              value={formatCompactEur(ratios.working_capital.value)}
              caveat={!ratios.working_capital.reliable ? ratios.working_capital.note : null}
              delay={120}
            />
            <KpiTile
              label="Revenue"
              value={formatCompactEur(ratios.revenue_period.value)}
              caveat={!ratios.revenue_period.reliable ? ratios.revenue_period.note : null}
              delay={180}
            />
            <KpiTile
              label="Gross margin"
              value={
                ratios.gross_profit_margin.value !== null
                  ? formatPct(ratios.gross_profit_margin.value, 1)
                  : "—"
              }
              caveat={!ratios.gross_profit_margin.reliable ? ratios.gross_profit_margin.note : null}
              delay={240}
            />
          </div>
        </section>
      )}

      {/* Top issues */}
      <section>
        <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
          Top issues
        </h2>
        <ul className="space-y-2">
          {ranked.map((c, i) => (
            <li
              key={c.check_id}
              className="bg-white border border-[var(--color-brand-line)] rounded-lg p-4 flex items-start gap-3 motion-safe:animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <StatusBadge status={c.status} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-brand-ink)]">{c.label}</p>
                <p className="text-sm text-[var(--color-brand-muted)] mt-0.5">
                  {c.affected_amount !== null
                    ? `${formatEur(c.affected_amount)} — `
                    : ""}
                  {c.status === "blocker"
                    ? "Fix this → unlocks advisory."
                    : c.score_after_fix !== null
                    ? `Fix → score goes to ${formatPct(c.score_after_fix)}.`
                    : ""}
                </p>
              </div>
            </li>
          ))}
          {ranked.length === 0 && (
            <li className="text-sm text-[var(--color-brand-muted)]">
              No outstanding issues. All 10 checks passed.
            </li>
          )}
        </ul>
      </section>

      {/* CTAs */}
      <section className="flex flex-wrap gap-3">
        <Link
          href="/report"
          className="px-5 py-2.5 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] transition-colors"
        >
          View full report →
        </Link>
        <Link
          href="/advisory"
          className="px-5 py-2.5 rounded-lg border border-[var(--color-brand-navy)] text-[var(--color-brand-navy)] text-sm font-medium hover:bg-[var(--color-brand-cream-deep)] transition-colors"
        >
          {readiness.advice_ready ? "View advisory →" : "View guided diagnosis →"}
        </Link>
        <button
          onClick={onRerun}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-navy)] transition-colors"
        >
          {showRerun ? "Cancel" : "Re-run with different period"}
        </button>
        <button
          onClick={onStartOver}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-rose-deep)] transition-colors"
        >
          Start over
        </button>
      </section>

      {/* Re-run drawer (collapsible) */}
      {showRerun && (
        <section className="bg-white border border-[var(--color-brand-line)] rounded-lg p-5 motion-safe:animate-fade-in-up">
          <h3 className="text-sm font-medium text-[var(--color-brand-ink)] mb-4">
            Re-run readiness on a different period
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <DateField label="From" value={periodStart} onChange={setPeriodStart} />
            <DateField label="To"   value={periodEnd}   onChange={setPeriodEnd}   />
            <button
              onClick={runCheck}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] disabled:opacity-50 transition-colors"
            >
              {loading ? "Running…" : "Run"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-[var(--color-brand-rose-deep)]">{error}</p>
          )}
        </section>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function severitySort(a: ReadinessCheck, b: ReadinessCheck): number {
  const order = { blocker: 0, fail: 1, warn: 2, pass: 3 } as const;
  return order[a.status] - order[b.status];
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-1.5">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[var(--color-brand-line)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-navy)]"
      />
    </div>
  );
}
