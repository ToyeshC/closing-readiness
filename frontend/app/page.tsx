'use client'

// Screen 1 — Connect & Run
// This is the entry point of the app. It does three things:
//   1. Checks whether Exact Online OAuth is connected (GET /auth/exact/status)
//   2. Lets the user pick an analysis period (defaults to 2024)
//   3. Fires the readiness check (POST /api/v1/readiness), stores the result in
//      localStorage, then navigates to /report
//
// We use localStorage so the report and advisory screens can read the result
// without needing a global state library — fine for a hackathon demo.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnalysisResult } from './types'

// Reads the backend URL from the environment. In dev this is localhost:8000;
// in production set NEXT_PUBLIC_API_URL in the Vercel dashboard to the
// Railway backend URL.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function Home() {
  const router = useRouter()

  // Auth state: null = still loading, true = connected, false = not connected
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [divisionId, setDivisionId] = useState<number | null>(null)

  // Default to the last complete calendar year, computed at render time so the
  // app doesn't show stale years as time passes. User can still override via
  // the date pickers; backend also computes the same default if dates are omitted.
  const _lastYear = new Date().getFullYear() - 1
  const [periodStart, setPeriodStart] = useState(`${_lastYear}-01-01`)
  const [periodEnd, setPeriodEnd] = useState(`${_lastYear}-12-31`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On mount, check whether the backend has a stored Exact Online token.
  // The token is stored in oauth_tokens.db by Toyesh's auth_exact router
  // after the user completes the /auth/exact/redirect OAuth flow.
  useEffect(() => {
    fetch(`${API_URL}/auth/exact/status`)
      .then(r => r.json())
      .then(d => {
        setAuthenticated(d.authenticated)
        setDivisionId(d.division_id)
      })
      .catch(() => setAuthenticated(false)) // backend unreachable — treat as not connected
  }, [])

  async function runCheck() {
    setLoading(true)
    setError(null)
    try {
      // Period dates are passed as query params; the backend defaults to 2024
      // if omitted, but we pass them explicitly so the UI controls matter.
      const resp = await fetch(
        `${API_URL}/api/v1/readiness?period_start=${periodStart}&period_end=${periodEnd}`,
        { method: 'POST' }
      )
      if (!resp.ok) throw new Error(`Backend returned ${resp.status}`)

      const result: AnalysisResult = await resp.json()

      // Store the full result so /report and /advisory can read it without
      // re-fetching. The dataset field is large but stays well under the 5MB
      // localStorage limit for this demo dataset.
      localStorage.setItem('analysis_result', JSON.stringify(result))
      router.push('/report')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top header bar */}
      <header className="bg-slate-900 text-white px-8 py-5">
        <h1 className="text-xl font-semibold tracking-tight">Consult&amp;Co</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Financial Closing Readiness — Fietsatelier Morgenwind BV
        </p>
      </header>

      <div className="max-w-2xl mx-auto px-8 py-12 space-y-10">

        {/* ── Data source section ── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Data source
          </h2>
          {authenticated === null ? (
            // Still fetching auth status from backend
            <p className="text-slate-400 text-sm">Checking connection…</p>
          ) : authenticated ? (
            // Token is present in oauth_tokens.db — live Exact Online data will be used
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Connected to Exact Online
                {divisionId && (
                  <span className="text-green-600 font-normal">· division {divisionId}</span>
                )}
              </span>
            </div>
          ) : (
            // No token — backend will fall back to local "00 Dataroom hackathon" files
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-sm">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Not connected — using local data files
              </span>
              {/* Clicking this starts the OAuth flow; the callback stores the token */}
              <a
                href={`${API_URL}/auth/exact/redirect`}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Connect to Exact Online →
              </a>
            </div>
          )}
        </section>

        {/* ── Analysis period section ── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Analysis period
          </h2>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ── Run button ── */}
        <section>
          <button
            onClick={runCheck}
            disabled={loading}
            className="w-full bg-slate-900 text-white py-3 px-6 rounded-lg font-medium
                       hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors text-sm"
          >
            {loading ? 'Running 10 data quality checks…' : 'Run Readiness Check'}
          </button>

          {/* Error shown if the backend call fails (e.g. backend not running) */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}
