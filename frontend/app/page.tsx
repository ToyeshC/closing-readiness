"use client";

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

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [divisionId, setDivisionId] = useState<number | null>(null);

  const _lastYear = new Date().getFullYear() - 1;
  const [periodStart, setPeriodStart] = useState(`${_lastYear}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${_lastYear}-12-31`);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRerun, setShowRerun] = useState(false);

  useEffect(() => {
    // Clear stale analysis after OAuth re-auth (?fresh=1 set by callback redirect)
    const params = new URLSearchParams(window.location.search);
    if (params.get("fresh") === "1") {
      localStorage.removeItem("analysis_result");
      window.history.replaceState({}, "", "/");
      return;
    }
    try {
      const raw = localStorage.getItem("analysis_result");
      if (raw) setResult(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAuthStatus()
      .then((d) => { setAuthenticated(d.authenticated); setDivisionId(d.division_id); })
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
      if (!result) router.push("/report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col"
      style={{
        backgroundImage: `repeating-linear-gradient(
          180deg,
          transparent, transparent 31px,
          rgba(229,223,210,0.4) 31px,
          rgba(229,223,210,0.4) 32px
        )`,
      }}
    >
      <Header current="home" authenticated={!!authenticated} divisionId={divisionId} />

      {result ? (
        <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
          <ExecutiveSummary
            result={result}
            onRerun={() => setShowRerun(!showRerun)}
            onStartOver={handleStartOver}
            showRerun={showRerun}
            periodStart={periodStart}
            periodEnd={periodEnd}
            setPeriodStart={setPeriodStart}
            setPeriodEnd={setPeriodEnd}
            loading={loading}
            error={error}
            runCheck={runCheck}
          />
        </div>
      ) : (
        <div className="flex-1 flex">
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
        </div>
      )}
    </main>
  );
}

// ── Pre-run: split hero layout ────────────────────────────────────────────────

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
    <div className="w-full flex flex-col md:flex-row min-h-[calc(100vh-64px)]">

      {/* Left — hero copy with ledger background */}
      <div
        className="flex-1 flex flex-col justify-center px-10 lg:px-20 py-16"
        style={{
          backgroundImage: `repeating-linear-gradient(
            180deg,
            transparent,
            transparent 31px,
            rgba(229,223,210,0.5) 31px,
            rgba(229,223,210,0.5) 32px
          )`,
        }}
      >
        <div className="max-w-lg">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-rose-deep)] mb-8">
            Financial Closing Readiness
          </p>
          <div className="flex gap-5 mb-8">
            <div className="w-0.5 self-stretch bg-[var(--color-brand-rose)] shrink-0 rounded-full" />
            <h1 className="font-[family-name:var(--font-display)] text-5xl lg:text-6xl font-bold text-[var(--color-brand-navy)] leading-[1.06]">
              Your books,<br />ready for<br />closing.
            </h1>
          </div>
          <p className="text-[var(--color-brand-muted)] text-base leading-relaxed max-w-sm">
            Ten deterministic data-quality checks protect every AI advisory from dirty books.
            Clean data in, trusted advisory out.
          </p>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="md:w-[400px] lg:w-[460px] bg-[var(--color-brand-cream-deep)] flex items-center px-8 lg:px-12 py-16 border-l border-[var(--color-brand-line)]">
        <div className="w-full space-y-6">

          {/* Data source */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-2.5 font-medium">
              Data source
            </p>
            {authenticated === null ? (
              <p className="text-[var(--color-brand-muted)] text-sm">Checking connection…</p>
            ) : authenticated ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-brand-navy)]/8 text-[var(--color-brand-navy)] text-sm border border-[var(--color-brand-navy)]/15">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Exact Online connected
                {divisionId && (
                  <span className="text-[var(--color-brand-muted)] font-normal text-xs">· {divisionId}</span>
                )}
              </span>
            ) : (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-brand-navy)]/6 text-[var(--color-brand-muted)] text-sm border border-[var(--color-brand-line)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-brand-muted)]/40" />
                  Using local data files
                </span>
                <div>
                  <a
                    href={authRedirectUrl()}
                    className="text-xs text-[var(--color-brand-muted)] hover:text-[var(--color-brand-navy)] underline"
                  >
                    Connect to Exact Online →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Period */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-2.5 font-medium">
              Analysis period
            </p>
            <div className="flex gap-3">
              <DateField label="From" value={periodStart} onChange={setPeriodStart} />
              <DateField label="To"   value={periodEnd}   onChange={setPeriodEnd}   />
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={runCheck}
            disabled={loading}
            className="w-full bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] py-3.5 rounded-xl font-semibold text-sm hover:bg-[var(--color-brand-navy-soft)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Running checks…" : "Run readiness check"}
          </button>

          {error && (
            <div className="px-4 py-3 bg-[var(--color-status-blocker-bg)] border border-[var(--color-status-blocker)]/30 rounded-lg text-[var(--color-status-blocker)] text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Executive summary ─────────────────────────────────────────────────────────

interface ExecSummaryProps {
  result: AnalysisResult;
  onRerun: () => void;
  onStartOver: () => void;
  showRerun: boolean;
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

  const ranked = readiness.checks
    .filter((c) => c.status !== "pass")
    .sort(severitySort)
    .slice(0, 3);

  const blockerCount = readiness.checks.filter((c) => c.status === "blocker").length;
  const passCount    = readiness.checks.filter((c) => c.status === "pass").length;

  return (
    <div className="space-y-8">
      {/* Score hero */}
      <section className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-6 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center motion-safe:animate-fade-in-up">
        <ScoreGauge score={readiness.overall_score} size={180} />
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--color-brand-navy)] mb-1">
            {readiness.advice_ready ? "Advisory ready" : "Guided diagnosis available"}
          </h1>
          <p className="text-sm text-[var(--color-brand-muted)] mb-4 max-w-md">
            {readiness.advice_ready
              ? "All blockers cleared. Claude can run a closing advisory on this period."
              : blockerCount > 0
              ? `${blockerCount} blocker${blockerCount > 1 ? "s" : ""} present. Resolve to unlock advisory.`
              : `Score below the ${formatPct(0.6)} threshold. Resolve failing checks to enable advisory.`}
          </p>
          {/* Status strip */}
          <div className="flex items-center gap-3 text-xs mb-5">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-status-pass-bg)] text-[var(--color-status-pass)] font-medium border border-[var(--color-status-pass)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-pass)]" />
              {passCount} passing
            </span>
            {blockerCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-status-blocker-bg)] text-[var(--color-status-blocker)] font-medium border border-[var(--color-status-blocker)]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-blocker)]" />
                {blockerCount} blocker{blockerCount > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-[var(--color-brand-muted)]">
              {periodStart} — {periodEnd}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/report"
              className="px-4 py-2 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] transition-colors"
            >
              Full report
            </Link>
            <Link
              href="/advisory"
              className="px-4 py-2 rounded-lg border border-[var(--color-brand-line)] text-[var(--color-brand-navy)] text-sm font-medium hover:bg-[var(--color-brand-cream-deep)] transition-colors"
            >
              {readiness.advice_ready ? "Findings" : "Findings"}
            </Link>
            <button
              onClick={onRerun}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-navy)] cursor-pointer transition-colors"
            >
              {showRerun ? "Cancel" : "Re-run"}
            </button>
            <button
              onClick={onStartOver}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-rose-deep)] cursor-pointer transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      {ratios && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3 font-semibold">
            Financial ratios
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="DSO" value={ratios.dso_days.value !== null ? formatDays(ratios.dso_days.value) : "—"} caveat={!ratios.dso_days.reliable ? ratios.dso_days.note : null} delay={0} />
            <KpiTile label="DPO" value={ratios.dpo_days.value !== null ? formatDays(ratios.dpo_days.value) : "—"} caveat={!ratios.dpo_days.reliable ? ratios.dpo_days.note : null} delay={60} />
            <KpiTile label="Revenue" value={formatCompactEur(ratios.revenue_period.value)} caveat={!ratios.revenue_period.reliable ? ratios.revenue_period.note : null} delay={120} />
            <KpiTile label="Purchases" value={formatCompactEur(ratios.purchases_period.value)} caveat={!ratios.purchases_period.reliable ? ratios.purchases_period.note : null} delay={180} />
            <KpiTile label="Gross margin" value={ratios.gross_profit_margin.value !== null ? formatPct(ratios.gross_profit_margin.value, 1) : "—"} caveat={!ratios.gross_profit_margin.reliable ? ratios.gross_profit_margin.note : null} delay={240} />
            <KpiTile label="Open AR" value={formatCompactEur(ratios.open_ar.value)} caveat={!ratios.open_ar.reliable ? ratios.open_ar.note : null} delay={300} />
            <KpiTile label="Open AP" value={formatCompactEur(ratios.open_ap.value)} caveat={!ratios.open_ap.reliable ? ratios.open_ap.note : null} delay={360} />
            <KpiTile label="Working cap." value={formatCompactEur(ratios.working_capital.value)} caveat={!ratios.working_capital.reliable ? ratios.working_capital.note : null} delay={420} />
          </div>
        </section>
      )}

      {/* Top issues */}
      {ranked.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3 font-semibold">
            Top issues
          </h2>
          <div className="space-y-2">
            {ranked.map((c, i) => (
              <div
                key={c.check_id}
                className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 rounded-lg px-4 py-3 flex items-start gap-3 motion-safe:animate-fade-in-up"
                style={{
                  borderLeftColor:
                    c.status === "blocker" ? "var(--color-status-blocker)"
                    : c.status === "fail"  ? "var(--color-status-fail)"
                    : "var(--color-status-warn)",
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <StatusBadge status={c.status} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-brand-ink)]">{c.label}</p>
                  <p className="text-xs text-[var(--color-brand-muted)] mt-0.5">
                    {c.affected_amount !== null ? `${formatEur(c.affected_amount)} — ` : ""}
                    {c.status === "blocker"
                      ? "Fix this to unlock advisory."
                      : c.score_after_fix !== null
                      ? `Fix this → score ${formatPct(c.score_after_fix)}.`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Re-run drawer */}
      {showRerun && (
        <section className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-5 motion-safe:animate-fade-in-up">
          <h3 className="text-sm font-semibold text-[var(--color-brand-ink)] mb-4">
            Re-run on a different period
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <DateField label="From" value={periodStart} onChange={setPeriodStart} />
            <DateField label="To"   value={periodEnd}   onChange={setPeriodEnd}   />
            <button
              onClick={runCheck}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-semibold hover:bg-[var(--color-brand-navy-soft)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Running…" : "Run"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-[var(--color-status-blocker)]">{error}</p>}
        </section>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severitySort(a: ReadinessCheck, b: ReadinessCheck): number {
  const order = { blocker: 0, fail: 1, warn: 2, pass: 3 } as const;
  return order[a.status] - order[b.status];
}

function DarkDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="flex-1">
      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5 font-medium">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/40 [color-scheme:dark]"
      />
    </div>
  );
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
      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-1.5 font-medium">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[var(--color-brand-line)] rounded-lg px-3 py-2 text-sm bg-[var(--color-brand-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-navy)]"
      />
    </div>
  );
}
