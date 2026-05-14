"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { AnalysisResult, FinancialRatios, AgingEntry, SectorBenchmarks } from "../types";
import { Header } from "../../components/Header";
import { ScoreGauge } from "../../components/ScoreGauge";
import { KpiTile } from "../../components/KpiTile";
import { CheckCard } from "../../components/CheckCard";
import { formatEur, formatCompactEur, formatDays, formatPct } from "../../lib/format";

export default function ReportPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("analysis_result");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  if (!result) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="report" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[var(--color-brand-muted)]">
            <p className="text-lg mb-3">No readiness report yet.</p>
            <Link
              href="/"
              className="text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline text-sm"
            >
              ← Run a check first
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { readiness } = result;

  return (
    <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
      <Header current="report" />

      <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
        {/* Score summary */}
        <section className="mb-10 bg-white border border-[var(--color-brand-line)] rounded-lg p-6 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center motion-safe:animate-fade-in-up">
          <ScoreGauge score={readiness.overall_score} size={150} />
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  readiness.advice_ready
                    ? "bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)]"
                    : "bg-[var(--color-brand-rose)]/20 text-[var(--color-brand-rose-deep)] border border-[var(--color-brand-rose)]"
                }`}
              >
                {readiness.advice_ready ? "Advisory ready" : "Advisory blocked"}
              </span>
              <span className="text-xs text-[var(--color-brand-muted)]">
                Threshold {formatPct(0.6)}
              </span>
            </div>
            <p className="text-sm text-[var(--color-brand-muted)] max-w-xl">
              {readiness.advice_ready
                ? "Data passed all blockers. Claude advisory below uses verified facts only."
                : "At least one blocker present. Claude runs guided-diagnosis mode instead of advisory."}
            </p>
            <div className="mt-4">
              <Link
                href="/advisory"
                className="text-sm text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline"
              >
                {readiness.advice_ready ? "View advisory →" : "View guided diagnosis →"}
              </Link>
            </div>
          </div>
        </section>

        {/* Ratios */}
        {readiness.ratios && <RatiosPanel ratios={readiness.ratios} />}

        {/* AR/AP aging breakdown */}
        {readiness.ratios && (
          <AgingSection
            arAging={readiness.ratios.ar_aging_detail ?? []}
            apAging={readiness.ratios.ap_aging_detail ?? []}
          />
        )}

        {/* Sector benchmarks */}
        {result.sector_benchmarks && (
          <BenchmarksPanel
            benchmarks={result.sector_benchmarks}
            grossMargin={readiness.ratios?.gross_profit_margin.value ?? null}
          />
        )}

        {/* Check cards */}
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
            Data quality checks ({readiness.checks.length})
          </h2>
          <div className="space-y-3">
            {readiness.checks.map((c, i) => (
              <CheckCard key={c.check_id} check={c} delay={i * 40} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// ── Sub-component: ratios panel ──────────────────────────────────────────────

function RatiosPanel({ ratios }: { ratios: FinancialRatios }) {
  const tiles = [
    { label: "DSO", value: ratios.dso_days, fmt: (v: number) => formatDays(v) },
    { label: "DPO", value: ratios.dpo_days, fmt: (v: number) => formatDays(v) },
    { label: "Working capital", value: ratios.working_capital, fmt: (v: number) => formatCompactEur(v) },
    { label: "Revenue", value: ratios.revenue_period, fmt: (v: number) => formatCompactEur(v) },
    { label: "Gross margin", value: ratios.gross_profit_margin, fmt: (v: number) => formatPct(v, 1) },
  ];

  return (
    <section className="mb-6">
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
        Financial ratios
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map(({ label, value, fmt }, i) => (
          <KpiTile
            key={label}
            label={label}
            value={value.value !== null ? fmt(value.value) : "—"}
            caveat={!value.reliable && value.note ? value.note : null}
            delay={i * 60}
          />
        ))}
      </div>
    </section>
  );
}

// ── Sub-component: aging tables ──────────────────────────────────────────────

function agingBucketStyle(bucket: string): string {
  switch (bucket) {
    case "0-30": return "text-[var(--color-brand-muted)]";
    case "31-60": return "text-amber-600 font-medium";
    case "61-90": return "text-amber-700 font-medium";
    case "90+":   return "text-[var(--color-brand-rose-deep)] font-semibold";
    default:       return "text-[var(--color-brand-muted)]";
  }
}

function AgingTable({ entries, title }: { entries: AgingEntry[]; title: string }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="border border-[var(--color-brand-line)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-[var(--color-brand-cream)] transition-colors text-left"
      >
        <span className="text-xs font-semibold text-[var(--color-brand-navy)] uppercase tracking-wide">
          {title}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-brand-muted)]">
            {entries.length} {entries.length === 1 ? "counterparty" : "counterparties"}
          </span>
          <span className="text-[var(--color-brand-muted)] text-sm">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--color-brand-cream-deep)] border-t border-[var(--color-brand-line)]">
                <th className="text-left px-4 py-2 font-semibold text-[var(--color-brand-muted)] uppercase tracking-wide">Counterparty</th>
                <th className="text-right px-4 py-2 font-semibold text-[var(--color-brand-muted)] uppercase tracking-wide">Amount</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--color-brand-muted)] uppercase tracking-wide">Aging</th>
                <th className="text-left px-4 py-2 font-semibold text-[var(--color-brand-muted)] uppercase tracking-wide hidden sm:table-cell">Invoice ref</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr
                  key={i}
                  className="border-t border-[var(--color-brand-line)] bg-white even:bg-[var(--color-brand-cream)]/40"
                >
                  <td className="px-4 py-2.5 text-[var(--color-brand-ink)] font-medium">{e.counterparty}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-brand-ink)] tabular-nums">{formatEur(e.amount)}</td>
                  <td className={`px-4 py-2.5 text-center ${agingBucketStyle(e.aging_bucket)}`}>
                    {e.aging_bucket}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-brand-muted)] hidden sm:table-cell">
                    {e.invoice_ref ?? "—"}
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

function AgingSection({ arAging, apAging }: { arAging: AgingEntry[]; apAging: AgingEntry[] }) {
  if (arAging.length === 0 && apAging.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
        Receivables &amp; payables aging
      </h2>
      <div className="space-y-3">
        {arAging.length > 0 && (
          <AgingTable entries={arAging} title="AR aging — top debtors" />
        )}
        {apAging.length > 0 && (
          <AgingTable entries={apAging} title="AP aging — top creditors" />
        )}
      </div>
    </section>
  );
}

// ── Sub-component: sector benchmarks ─────────────────────────────────────────

function BenchmarkRow({
  label,
  company,
  sector,
  higher = "better",
}: {
  label: string;
  company: string;
  sector: string;
  higher?: "better" | "worse";
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3 border-t border-[var(--color-brand-line)] first:border-0">
      <span className="text-xs text-[var(--color-brand-muted)] self-center">{label}</span>
      <span className="text-sm font-semibold text-[var(--color-brand-navy)] text-center">{company}</span>
      <span className="text-sm text-[var(--color-brand-muted)] text-center">{sector}</span>
    </div>
  );
}

function BenchmarksPanel({
  benchmarks,
  grossMargin,
}: {
  benchmarks: SectorBenchmarks;
  grossMargin: number | null;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3">
        Sector context
      </h2>
      <div className="bg-white border border-[var(--color-brand-line)] rounded-lg p-5 motion-safe:animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-brand-navy)]">{benchmarks.sector_name}</p>
            <p className="text-[10px] text-[var(--color-brand-muted)] mt-0.5">SBI {benchmarks.sbi_code}</p>
          </div>
          <span className="text-[10px] text-[var(--color-brand-muted)] text-right">
            Source: {benchmarks.source.split("/")[0].trim()} {benchmarks.reference_year}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-3 gap-4 pb-2">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)]">Metric</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-brand-navy)] text-center">This company</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] text-center">Sector median</span>
        </div>

        {benchmarks.gross_margin_median !== null && (
          <BenchmarkRow
            label="Gross margin"
            company={grossMargin !== null ? formatPct(grossMargin, 1) : "—"}
            sector={formatPct(benchmarks.gross_margin_median, 1)}
          />
        )}
        {benchmarks.revenue_per_fte_median !== null && (
          <BenchmarkRow
            label="Revenue / FTE"
            company="—"
            sector={formatCompactEur(benchmarks.revenue_per_fte_median)}
          />
        )}
        {benchmarks.dso_days_approx !== null && (
          <BenchmarkRow
            label="DSO (approx)"
            company="—"
            sector={formatDays(benchmarks.dso_days_approx)}
          />
        )}
        {benchmarks.dpo_days_approx !== null && (
          <BenchmarkRow
            label="DPO (approx)"
            company="—"
            sector={formatDays(benchmarks.dpo_days_approx)}
          />
        )}

        {benchmarks.notes && (
          <p className="mt-3 text-[10px] text-[var(--color-brand-muted)] border-t border-[var(--color-brand-line)] pt-3">
            {benchmarks.notes}
          </p>
        )}
      </div>
    </section>
  );
}
