"use client";

// Screen 2 — Readiness Report
// Reuses the shared Header, ScoreGauge, KpiTile, CheckCard, StatusBadge,
// and lib/format. The page is now mostly composition.

import { useState, useEffect } from "react";
import Link from "next/link";
import type { AnalysisResult, FinancialRatios } from "../types";
import { Header } from "../../components/Header";
import { ScoreGauge } from "../../components/ScoreGauge";
import { KpiTile } from "../../components/KpiTile";
import { CheckCard } from "../../components/CheckCard";
import { formatCompactEur, formatDays, formatPct } from "../../lib/format";

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
    <section className="mb-10">
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
