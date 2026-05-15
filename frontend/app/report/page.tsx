"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
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

      {/* Full-width navy hero */}
      <section className="bg-[var(--color-brand-navy)] w-full">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-12 flex flex-col sm:flex-row items-center gap-8 sm:gap-10">
          <ScoreGauge score={readiness.overall_score} size={150} />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-white mb-2 leading-snug">
              Financial Closing Review
            </h1>
            <p className="text-white/60 text-sm mb-6 max-w-lg">
              {readiness.advice_ready
                ? "All blockers cleared — advisory can run on verified data."
                : "Data quality issues detected — advisory blocked until resolved."}
            </p>
            <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
              <Link
                href="/advisory"
                className="px-4 py-2 border border-white/30 rounded-lg text-white text-sm font-medium hover:bg-white/10 transition-colors"
              >
                {readiness.advice_ready ? "View findings →" : "View findings →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      {readiness.ratios && <MetricsStrip ratios={readiness.ratios} />}

      {/* Main content */}
      <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 py-8 flex-1 space-y-10">

        {/* AR/AP aging */}
        {readiness.ratios && (
          <AgingSection
            arAging={readiness.ratios.ar_aging_detail ?? []}
            apAging={readiness.ratios.ap_aging_detail ?? []}
          />
        )}

        {/* Benchmarks + Working capital */}
        {(result.sector_benchmarks || readiness.ratios) && (
          <section className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
            {result.sector_benchmarks && (
              <BenchmarkBarsPanel
                benchmarks={result.sector_benchmarks}
                grossMargin={readiness.ratios?.gross_profit_margin.value ?? null}
                dso={readiness.ratios?.dso_days.value ?? null}
                dpo={readiness.ratios?.dpo_days.value ?? null}
              />
            )}
            {readiness.ratios && <WorkingCapitalPanel ratios={readiness.ratios} />}
          </section>
        )}

        {/* Data quality checks */}
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3 font-semibold">
            Data quality checks ({readiness.checks.length})
          </h2>
          <div className="space-y-2.5">
            {[...readiness.checks]
              .sort((a, b) => {
                const order = { blocker: 0, fail: 1, warn: 2, pass: 3 } as const;
                return order[a.status] - order[b.status];
              })
              .map((c, i) => (
                <CheckCard key={c.check_id} check={c} delay={i * 30} />
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// ── Metrics strip ─────────────────────────────────────────────────────────────

function MetricsStrip({ ratios }: { ratios: FinancialRatios }) {
  const tiles = [
    { label: "DSO",         value: ratios.dso_days.value !== null ? formatDays(ratios.dso_days.value) : "—",                       caveat: !ratios.dso_days.reliable ? ratios.dso_days.note : null },
    { label: "DPO",         value: ratios.dpo_days.value !== null ? formatDays(ratios.dpo_days.value) : "—",                       caveat: !ratios.dpo_days.reliable ? ratios.dpo_days.note : null },
    { label: "Revenue",     value: formatCompactEur(ratios.revenue_period.value),                                                   caveat: !ratios.revenue_period.reliable ? ratios.revenue_period.note : null },
    { label: "Purchases",   value: formatCompactEur(ratios.purchases_period.value),                                                 caveat: !ratios.purchases_period.reliable ? ratios.purchases_period.note : null },
    { label: "Gross margin",value: ratios.gross_profit_margin.value !== null ? formatPct(ratios.gross_profit_margin.value, 1) : "—", caveat: !ratios.gross_profit_margin.reliable ? ratios.gross_profit_margin.note : null },
    { label: "Open AR",     value: formatCompactEur(ratios.open_ar.value),                                                          caveat: !ratios.open_ar.reliable ? ratios.open_ar.note : null },
    { label: "Open AP",     value: formatCompactEur(ratios.open_ap.value),                                                          caveat: !ratios.open_ap.reliable ? ratios.open_ap.note : null },
    { label: "Working cap.",value: formatCompactEur(ratios.working_capital.value),                                                  caveat: !ratios.working_capital.reliable ? ratios.working_capital.note : null },
  ];

  return (
    <section className="bg-[var(--color-brand-surface)] border-b border-[var(--color-brand-line)]">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {tiles.map(({ label, value, caveat }, i) => (
            <KpiTile key={label} label={label} value={value} caveat={caveat ?? null} delay={i * 40} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── AR/AP Aging ───────────────────────────────────────────────────────────────

const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;

function AgingBarChart({ arAging, apAging }: { arAging: AgingEntry[]; apAging: AgingEntry[] }) {
  const chartData = AGING_BUCKETS.map((b) => ({
    bucket: b === "90+" ? "90+ days" : `${b} days`,
    ar: arAging.filter((e) => e.aging_bucket === b).reduce((s, e) => s + e.amount, 0),
    ap: apAging.filter((e) => e.aging_bucket === b).reduce((s, e) => s + e.amount, 0),
  }));

  const hasData = chartData.some((d) => d.ar > 0 || d.ap > 0);
  if (!hasData) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 8, bottom: 0 }} barGap={4}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-brand-line)"
          vertical={false}
        />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: "var(--color-brand-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatCompactEur(v)}
          tick={{ fontSize: 11, fill: "var(--color-brand-muted)" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(value: unknown) => [
            formatEur(typeof value === "number" ? value : Number(value)),
            "",
          ]}
          contentStyle={{
            fontSize: 12,
            border: "1px solid var(--color-brand-line)",
            borderRadius: 8,
            background: "var(--color-brand-surface)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(v: string) => (v === "ar" ? "Receivables" : "Payables")}
        />
        <Bar dataKey="ar" name="ar" fill="var(--color-brand-navy)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="ap" name="ap" fill="var(--color-brand-rose-deep)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function agingBucketStyle(bucket: string): string {
  switch (bucket) {
    case "0-30":  return "text-[var(--color-brand-muted)]";
    case "31-60": return "text-amber-600 font-medium";
    case "61-90": return "text-amber-700 font-medium";
    case "90+":   return "text-[var(--color-brand-rose-deep)] font-semibold";
    default:      return "text-[var(--color-brand-muted)]";
  }
}

function AgingTable({ entries, title }: { entries: AgingEntry[]; title: string }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="border border-[var(--color-brand-line)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-brand-surface)] hover:bg-[var(--color-brand-cream)] transition-colors text-left cursor-pointer"
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
                  className="border-t border-[var(--color-brand-line)] bg-[var(--color-brand-surface)] even:bg-[var(--color-brand-cream)]/40"
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
    <section>
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-3 font-semibold">
        Receivables &amp; payables aging
      </h2>
      <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-5 mb-4">
        <AgingBarChart arAging={arAging} apAging={apAging} />
      </div>
      <div className="space-y-3">
        {arAging.length > 0 && <AgingTable entries={arAging} title="AR detail — top debtors" />}
        {apAging.length > 0 && <AgingTable entries={apAging} title="AP detail — top creditors" />}
      </div>
    </section>
  );
}

// ── Sector benchmarks (horizontal bars) ──────────────────────────────────────

function BenchmarkBarRow({
  label,
  companyValue,
  sectorValue,
  companyLabel,
  sectorLabel,
}: {
  label: string;
  companyValue: number | null;
  sectorValue: number | null;
  companyLabel: string;
  sectorLabel: string;
}) {
  const max = Math.max(companyValue ?? 0, sectorValue ?? 0);
  const companyPct = max > 0 && companyValue !== null ? Math.min((companyValue / max) * 100, 100) : 0;
  const sectorPct  = max > 0 && sectorValue  !== null ? Math.min((sectorValue  / max) * 100, 100) : 0;

  return (
    <div className="py-2.5 border-t border-[var(--color-brand-line)] first:border-0">
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-brand-muted)] mb-2 font-medium">
        {label}
      </p>
      <div className="space-y-1.5">
        {companyValue !== null && (
          <div className="flex items-center gap-2">
            <div className="w-14 text-right shrink-0">
              <span className="text-xs font-semibold text-[var(--color-brand-navy)] tabular-nums">{companyLabel}</span>
            </div>
            <div className="flex-1 h-2 bg-[var(--color-brand-cream-deep)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-brand-navy)] rounded-full transition-all duration-700"
                style={{ width: `${companyPct}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-brand-navy)] font-medium w-16 shrink-0">This co.</span>
          </div>
        )}
        {sectorValue !== null && (
          <div className="flex items-center gap-2">
            <div className="w-14 text-right shrink-0">
              <span className="text-xs font-normal text-[var(--color-brand-muted)] tabular-nums">{sectorLabel}</span>
            </div>
            <div className="flex-1 h-2 bg-[var(--color-brand-cream-deep)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-brand-muted)]/50 rounded-full transition-all duration-700"
                style={{ width: `${sectorPct}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-brand-muted)] w-16 shrink-0">Sector</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BenchmarkBarsPanel({
  benchmarks,
  grossMargin,
  dso,
  dpo,
}: {
  benchmarks: SectorBenchmarks;
  grossMargin: number | null;
  dso: number | null;
  dpo: number | null;
}) {
  return (
    <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-[var(--color-brand-navy)]">{benchmarks.sector_name}</p>
          <p className="text-[10px] text-[var(--color-brand-muted)] mt-0.5">SBI {benchmarks.sbi_code}</p>
        </div>
        <span className="text-[10px] text-[var(--color-brand-muted)] text-right">
          {benchmarks.source.split("/")[0].trim()} {benchmarks.reference_year}
        </span>
      </div>

      {benchmarks.gross_margin_median !== null && (
        <BenchmarkBarRow
          label="Gross margin"
          companyValue={grossMargin}
          sectorValue={benchmarks.gross_margin_median}
          companyLabel={grossMargin !== null ? formatPct(grossMargin, 1) : "—"}
          sectorLabel={formatPct(benchmarks.gross_margin_median, 1)}
        />
      )}
      {benchmarks.dso_days_approx !== null && (
        <BenchmarkBarRow
          label="DSO"
          companyValue={dso}
          sectorValue={benchmarks.dso_days_approx}
          companyLabel={dso !== null ? formatDays(dso) : "—"}
          sectorLabel={formatDays(benchmarks.dso_days_approx)}
        />
      )}
      {benchmarks.dpo_days_approx !== null && (
        <BenchmarkBarRow
          label="DPO"
          companyValue={dpo}
          sectorValue={benchmarks.dpo_days_approx}
          companyLabel={dpo !== null ? formatDays(dpo) : "—"}
          sectorLabel={formatDays(benchmarks.dpo_days_approx)}
        />
      )}
      {benchmarks.revenue_per_fte_median !== null && (
        <BenchmarkBarRow
          label="Revenue / FTE"
          companyValue={null}
          sectorValue={benchmarks.revenue_per_fte_median}
          companyLabel="—"
          sectorLabel={formatCompactEur(benchmarks.revenue_per_fte_median)}
        />
      )}

      {benchmarks.notes && (
        <p className="mt-3 text-[10px] text-[var(--color-brand-muted)] border-t border-[var(--color-brand-line)] pt-3">
          {benchmarks.notes}
        </p>
      )}
    </div>
  );
}

// ── Working capital decomposition ─────────────────────────────────────────────

function WcBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number | null;
  maxValue: number;
  color: string;
}) {
  const pct = value !== null && maxValue > 0
    ? Math.min((Math.abs(value) / maxValue) * 100, 100)
    : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-brand-muted)] w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-[var(--color-brand-cream-deep)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-[var(--color-brand-ink)] w-16 text-right shrink-0">
        {formatCompactEur(value ?? undefined)}
      </span>
    </div>
  );
}

function WorkingCapitalPanel({ ratios }: { ratios: FinancialRatios }) {
  const ar = ratios.open_ar.value;
  const ap = ratios.open_ap.value;
  const wc = ratios.working_capital.value;
  const maxVal = Math.max(ar ?? 0, ap ?? 0, Math.abs(wc ?? 0));

  return (
    <div className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-5">
      <p className="text-xs font-semibold text-[var(--color-brand-navy)] mb-4 uppercase tracking-wide text-[10px]">
        Working capital
      </p>
      <div className="space-y-3">
        <WcBar label="Open AR" value={ar} maxValue={maxVal} color="var(--color-brand-navy)" />
        <WcBar label="Open AP" value={ap} maxValue={maxVal} color="var(--color-brand-rose-deep)" />
        <div className="border-t border-[var(--color-brand-line)] pt-3">
          <WcBar
            label="Net WC"
            value={wc}
            maxValue={maxVal}
            color={wc !== null && wc >= 0 ? "var(--color-status-pass)" : "var(--color-brand-rose-deep)"}
          />
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-brand-muted)] mt-3">AR − AP = net working capital</p>
    </div>
  );
}
