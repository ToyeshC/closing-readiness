'use client'

// Screen 2 — Readiness Report
// Reads the AnalysisResult stored in localStorage by Screen 1 and displays:
//   - Overall score bar + advice-ready badge
//   - Ratios panel (DSO, DPO, working capital, revenue, gross margin)
//   - 10 check cards, one per data quality check
//
// Each check card shows:
//   - Colour-coded status badge (BLOCKER / FAIL / WARN / PASS)
//   - Label, description, affected amount
//   - score_after_fix hint: what the overall score would be if this check passed
//   - "Show source" toggle that fetches the raw GL/bank lines for that check

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnalysisResult, ReadinessCheck, FinancialRatios, SourceLine } from '../types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(amount: number | null) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

// Maps check status to Tailwind colour classes for the badge
function statusStyle(status: ReadinessCheck['status']) {
  switch (status) {
    case 'blocker': return 'bg-red-100 text-red-700 border-red-300'
    case 'fail':    return 'bg-orange-100 text-orange-700 border-orange-300'
    case 'warn':    return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    case 'pass':    return 'bg-green-100 text-green-700 border-green-300'
  }
}

// Maps check status to the label shown inside the badge
function statusLabel(status: ReadinessCheck['status']) {
  switch (status) {
    case 'blocker': return 'BLOCKER'
    case 'fail':    return 'FAIL'
    case 'warn':    return 'WARN'
    case 'pass':    return 'PASS'
  }
}

// Score bar colour changes based on how far from the 0.6 "advice ready" threshold
function scoreBarColour(score: number) {
  if (score >= 0.6) return 'bg-green-500'
  if (score >= 0.4) return 'bg-orange-400'
  return 'bg-red-500'
}

// ── Sub-component: individual check card ────────────────────────────────────

function CheckCard({ check }: { check: ReadinessCheck }) {
  const [showSources, setShowSources] = useState(false)
  const [sources, setSources] = useState<SourceLine[] | null>(null)
  const [loadingSources, setLoadingSources] = useState(false)

  async function toggleSources() {
    if (showSources) {
      setShowSources(false)
      return
    }
    // Only fetch if we haven't loaded them yet for this card
    if (!sources) {
      setLoadingSources(true)
      try {
        const resp = await fetch(`${API_URL}/api/v1/readiness/${check.check_id}/sources`)
        if (resp.ok) setSources(await resp.json())
      } finally {
        setLoadingSources(false)
      }
    }
    setShowSources(true)
  }

  const hasSources = check.status !== 'pass'
  const cardBorder = check.status === 'blocker' ? 'border-red-300' :
                     check.status === 'fail'    ? 'border-orange-200' :
                     check.status === 'warn'    ? 'border-yellow-200' :
                                                  'border-slate-200'

  return (
    <div className={`bg-white border rounded-lg p-4 ${cardBorder}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Status badge + label */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${statusStyle(check.status)}`}>
              {statusLabel(check.status)}
            </span>
            <span className="text-sm font-medium text-slate-800">{check.label}</span>
          </div>

          {/* Plain-English description from the engine */}
          <p className="text-sm text-slate-500 mb-2">{check.description}</p>

          {/* Monetary amount affected, if any */}
          {check.affected_amount !== null && check.affected_amount !== undefined && (
            <p className="text-sm font-medium text-slate-700">
              Amount: {formatEur(check.affected_amount)}
            </p>
          )}

          {/* score_after_fix: tells the user what fixing this check is worth.
              Blockers get a special message because they gate advice_ready,
              not the numeric score. Passing checks show nothing. */}
          {check.status === 'blocker' && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              Fix this → unlocks advisory
            </p>
          )}
          {check.status !== 'blocker' && check.status !== 'pass' && check.score_after_fix !== null && (
            <p className="mt-1 text-xs text-slate-500">
              Fix this → score goes to <span className="font-semibold">{formatPct(check.score_after_fix)}</span>
            </p>
          )}
        </div>

        {/* "Show source" button — only meaningful for non-passing checks */}
        {hasSources && (
          <button
            onClick={toggleSources}
            className="shrink-0 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
          >
            {loadingSources ? 'Loading…' : showSources ? 'Hide source' : 'Show source'}
          </button>
        )}
      </div>

      {/* Source lines table — expanded on demand */}
      {showSources && sources && sources.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-slate-600 border-t border-slate-100">
            <thead>
              <tr className="text-slate-400 uppercase tracking-wide">
                <th className="text-left py-1.5 pr-3">Date</th>
                <th className="text-left py-1.5 pr-3">Account</th>
                <th className="text-right py-1.5 pr-3">Amount</th>
                <th className="text-left py-1.5">Description</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i} className="border-t border-slate-50">
                  <td className="py-1 pr-3 whitespace-nowrap">{s.date}</td>
                  <td className="py-1 pr-3 font-mono">{s.account_code}</td>
                  <td className="py-1 pr-3 text-right whitespace-nowrap">{formatEur(s.amount)}</td>
                  <td className="py-1 text-slate-500 truncate max-w-xs">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Sub-component: financial ratios panel ────────────────────────────────────

function RatiosPanel({ ratios }: { ratios: FinancialRatios }) {
  // Each ratio card shows value + a warning note if reliable=false.
  // DPO is always flagged as needing verification — it reads 365 days on the
  // live dataset because purchase entries lack due dates in the Exact Online API.
  const cards = [
    { label: 'DSO',            value: ratios.dso_days,          unit: 'days', fmt: (v: number) => `${v.toFixed(1)} days` },
    { label: 'DPO',            value: ratios.dpo_days,          unit: 'days', fmt: (v: number) => `${v.toFixed(1)} days` },
    { label: 'Working capital',value: ratios.working_capital,   unit: '€',    fmt: (v: number) => formatEur(v) },
    { label: 'Revenue',        value: ratios.revenue_period,    unit: '€',    fmt: (v: number) => formatEur(v) },
    { label: 'Gross margin',   value: ratios.gross_profit_margin,unit: '%',   fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
  ]

  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
        Financial ratios
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(({ label, value, fmt }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            {value.value !== null ? (
              <p className="text-lg font-semibold text-slate-800">{fmt(value.value)}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">No data</p>
            )}
            {/* Show caveat note when the ratio is flagged as unreliable */}
            {(!value.reliable || label === 'DPO') && (
              <p className="text-xs text-amber-600 mt-1">
                {label === 'DPO'
                  ? 'Needs verification — purchase due dates unavailable in API'
                  : value.note || 'Data quality caveat'}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main page component ──────────────────────────────────────────────────────

export default function ReportPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null)

  // Read the result that Screen 1 stored after running the check
  useEffect(() => {
    const raw = localStorage.getItem('analysis_result')
    if (raw) setResult(JSON.parse(raw))
  }, [])

  if (!result) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <p className="text-lg mb-3">No readiness report yet.</p>
          <Link href="/" className="text-blue-600 underline text-sm">
            ← Run a check first
          </Link>
        </div>
      </main>
    )
  }

  const { readiness } = result
  const score = readiness.overall_score

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Consult&amp;Co</h1>
          <p className="text-slate-400 text-sm mt-0.5">Readiness Report — Fietsatelier Morgenwind BV</p>
        </div>
        <Link href="/" className="text-slate-400 hover:text-white text-sm underline">
          ← New check
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* ── Score summary ── */}
        <section className="mb-8 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-600">Overall readiness score</span>
            {/* advice_ready gates whether Claude advisory can run.
                False = at least one blocker exists → guided diagnosis mode instead */}
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              readiness.advice_ready
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {readiness.advice_ready ? 'Advisory ready' : 'Advisory blocked'}
            </span>
          </div>
          {/* Score bar */}
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColour(score)}`}
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>0%</span>
            <span className="font-semibold text-slate-700">{formatPct(score)}</span>
            <span>100%</span>
          </div>
          {/* Link to advisory screen — always accessible, shows guidance even when blocked */}
          <div className="mt-4 text-right">
            <Link
              href="/advisory"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {readiness.advice_ready ? 'View advisory →' : 'View guided diagnosis →'}
            </Link>
          </div>
        </section>

        {/* ── Ratios panel ── */}
        {readiness.ratios && <RatiosPanel ratios={readiness.ratios} />}

        {/* ── Check cards ── */}
        {/* Ordered by severity so blockers and failures appear first */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Data quality checks ({readiness.checks.length})
          </h2>
          <div className="space-y-3">
            {readiness.checks.map(check => (
              <CheckCard key={check.check_id} check={check} />
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
