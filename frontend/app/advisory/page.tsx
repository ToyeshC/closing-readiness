'use client'

// Screen 3 — Advisory / Guided Diagnosis
// Reads the same AnalysisResult from localStorage that Screen 1 stored.
//
// Two modes, determined by readiness.advice_ready:
//
//   advice_ready = true  → shows structured advisory outputs from call_claude()
//                          Each output is tagged FACT / ASSUMPTION / ADVICE with
//                          a confidence level and a source citation.
//
//   advice_ready = false → shows guided diagnosis from call_claude_guided()
//                          The engine found blockers/failures; instead of a hard
//                          block we call the LLM to explain each issue and give
//                          a concrete fix step. Stored in result.guided_response
//                          as a JSON string: { guidance: [{issue, impact, fix_step}] }

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnalysisResult, AdvisoryOutput } from '../types'

// ── Helpers ─────────────────────────────────────────────────────────────────

// Colour coding for advisory output types (FACT / ASSUMPTION / ADVICE)
function typeStyle(type: AdvisoryOutput['type']) {
  switch (type) {
    case 'FACT':       return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'ASSUMPTION': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'ADVICE':     return 'bg-violet-100 text-violet-700 border-violet-200'
  }
}

// Colour for confidence level
function confidenceStyle(conf: AdvisoryOutput['confidence']) {
  switch (conf) {
    case 'high':   return 'text-green-600'
    case 'medium': return 'text-yellow-600'
    case 'low':    return 'text-red-500'
  }
}

// ── Sub-component: single advisory output card ───────────────────────────────

function AdvisoryCard({ output }: { output: AdvisoryOutput }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        {/* Type badge: FACT / ASSUMPTION / ADVICE */}
        <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded border ${typeStyle(output.type)}`}>
          {output.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 mb-2">{output.statement}</p>
          {/* Source citation — every FACT must have one per the system prompt rules */}
          <p className="text-xs text-slate-400">
            Source: {output.source}
          </p>
          <p className={`text-xs font-medium mt-1 ${confidenceStyle(output.confidence)}`}>
            Confidence: {output.confidence}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-component: guided diagnosis (when advice_ready = false) ──────────────

function GuidedDiagnosis({ raw }: { raw: string }) {
  // guided_response is a JSON string from call_claude_guided().
  // Expected shape: { guidance: [{ issue, impact, fix_step }] }
  // We try to parse it; if the LLM returned malformed JSON we fall back to
  // displaying the raw text so something is always shown in the demo.
  let items: Array<{ issue: string; impact: string; fix_step: string }> = []
  let parseError = false

  try {
    const parsed = JSON.parse(raw)
    items = parsed.guidance || []
  } catch {
    parseError = true
  }

  if (parseError || items.length === 0) {
    // Fallback: render raw text — better than a blank screen during the demo
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-5 whitespace-pre-wrap text-sm text-slate-700">
        {raw}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-white border border-orange-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-slate-800 mb-1">
            {i + 1}. {item.issue}
          </p>
          {/* Why it matters for closing */}
          <p className="text-sm text-slate-500 mb-2">
            <span className="font-medium text-slate-600">Impact: </span>
            {item.impact}
          </p>
          {/* Concrete action the user needs to take */}
          <div className="bg-orange-50 border border-orange-100 rounded p-3">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">
              Fix step
            </p>
            <p className="text-sm text-slate-700">{item.fix_step}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page component ──────────────────────────────────────────────────────

export default function AdvisoryPage() {
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

  const { readiness, advisory_outputs, guided_response } = result

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Consult&amp;Co</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {readiness.advice_ready ? 'Advisory Output' : 'Guided Diagnosis'} — Fietsatelier Morgenwind BV
          </p>
        </div>
        <Link href="/report" className="text-slate-400 hover:text-white text-sm underline">
          ← Back to report
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {readiness.advice_ready ? (
          // ── Advisory mode: data passed all blockers, Claude gave structured analysis ──
          <>
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              Data quality checks passed — advisory outputs below are grounded in verified data.
              Each output is tagged FACT, ASSUMPTION, or ADVICE with a source citation.
            </div>
            <div className="space-y-3">
              {(advisory_outputs || []).map((output, i) => (
                <AdvisoryCard key={i} output={output} />
              ))}
              {(!advisory_outputs || advisory_outputs.length === 0) && (
                <p className="text-slate-400 text-sm">No advisory outputs returned.</p>
              )}
            </div>
          </>
        ) : (
          // ── Guided diagnosis mode: blockers found, LLM explains what to fix ──
          <>
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm font-semibold text-orange-800 mb-1">
                Advisory blocked — {result.blocked_reason}
              </p>
              <p className="text-sm text-orange-700">
                The engine found issues that must be resolved before a closing advisory can run.
                Below is an AI-generated fix guide based on the failing checks.
              </p>
            </div>
            {guided_response ? (
              <GuidedDiagnosis raw={guided_response} />
            ) : (
              <p className="text-slate-400 text-sm">No guided response available.</p>
            )}
          </>
        )}

      </div>
    </main>
  )
}
