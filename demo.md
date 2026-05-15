# Consult&Co — Demo Script (15 May 2026)

## What we built (30-second pitch)

Consult&Co is a closing-readiness tool that runs 10 data-quality checks against a client's
Exact Online ledger before any AI advisory is generated. It surfaces blockers (uncleared
suspense accounts, VAT gaps, stale aging), shows the advisor exactly which entries are
wrong, proposes per-check fixes, and produces a branded PDF advisory report — all in under
60 seconds of live data.

The core responsible-AI idea: **garbage in = garbage out**. The system refuses to give
confident advice until the books are clean enough. If a blocker exists, it enters
"guided diagnosis mode" and the advisor takes professional responsibility before proceeding.

---

## The demo flow (step by step)

### Step 0: Setup (do before audience arrives)
- Backend running: `uvicorn backend_FastAPI_emma.main:app --host 127.0.0.1 --port 8000 --reload --workers 1`
- Frontend running: `cd frontend && npm run dev`
- ngrok running (for Exact Online OAuth): `ngrok http --domain=unwired-sweep-apostle.ngrok-free.dev 127.0.0.1:8000`
- Browser open at `localhost:3000`, already authenticated (green "Connected · 4453885" badge visible)

### Step 1: Overview page — run the check (30 sec)

**Say:** "This is our client, Fietsatelier Morgenwind. I connect to their Exact Online
account and run ten data-quality checks."

- Period: 2024-01-01 to 2024-12-31 (pre-filled)
- Click "Run readiness check"
- **Expected result:** ~40% score, 1 blocker, 5 fails

**Talking point:** "The score is 40%. Immediately the system tells us: there's a suspense
account with €39,893 uncleared. That's a blocker — it means we cannot give a confident
advisory until this is resolved."

### Step 2: Report page — inspect the numbers (60 sec)

Navigate to Report tab.

**Talking point:** "Here we see the full picture — DSO, DPO, working capital, sector
benchmarks. The report tells us the DSO is 18 days versus a sector norm of around 30.
That's actually good."

- Scroll to "Data quality checks" section
- Click "▼ 38" on the Suspense account row → shows the 38 source GL entries with dates,
  amounts, and descriptions
- Click "Fix this →" on Suspense account balance → shows AI-proposed fix action

**Talking point:** "For each check, I can drill into the raw GL entries and ask the AI what
to do. It says: open Exact Online, filter account 1250, reclassify each entry. Thirty minutes
of effort, low risk."

**Key judge signal:** Every number shown traces back to a real ledger entry. No hallucination.

### Step 3: Findings page — guided diagnosis (90 sec)

Navigate to Findings tab.

**Show the amber banner:** "Guided diagnosis mode — data quality issue detected."

**Talking point:** "Because there's a blocker, we're in guided diagnosis mode. The AI
doesn't refuse to help — it tells the advisor: here's what we see, you take professional
responsibility. This is responsible AI design."

- Click "Analyse what's working" → waits for Claude
- **Expected output:** English summary of what's clean, early warnings for next quarter,
  root cause clusters (revenue reconciliation + VAT reconciliation are linked — both stem
  from GL period mis-allocation)

**Talking point:** "Notice the root cause clusters. Revenue reconciliation and VAT
reconciliation are failing for the same reason — a timing issue in how the bookkeeper
assigned periods. Fix one, fix both."

- Click "Generate remediation plan" → waits for Claude
- Show 2-3 fix plan cards with effort, confidence, risk levels
- Select 2-3 items and click "Approve selected"
- **Show the inline confirmation:** "3 actions approved — logged to LangWatch for audit trail"

**Talking point:** "Every approval is logged in LangWatch with a trace ID. The AI made a
recommendation; the advisor made the decision. Full audit trail."

### Step 4: PDF report download (30 sec)

On the Findings page, scroll to "Generate Report."

- Select: Financial ratios ✓, Readiness checks ✓, AI insights ✓, Fix plan ✓, Advisory summary ✓
- Language: EN
- Click "Download Report →"

Open the downloaded PDF.

**Talking point:** "The advisor gets a branded PDF they can send directly to the client.
Cover page with score, check results, AI insights, fix recommendations, and an advisory
summary written in the advisor's voice. Zero formatting work."

---

## Judging lens coverage

| Lens | How we address it |
|---|---|
| **Data modelling & validation** | 10 purpose-built checks with Dutch column names, VAT-gross matching, AR/AP aging buckets, CBS sector benchmarks |
| **Reliability** | Every route has try/except; CORS-safe 502s; demo seed PDFs for tax VAT cross-check; `--workers 1` for cache coherence |
| **Explainability & traceability** | `trace_id` on every response; LangWatch spans for every Claude call including the readiness guard; "Show source" on each check card |
| **Responsible AI** | `advice_ready` gate: any blocker → guided diagnosis mode; AI never writes to Exact Online; every advisory output labelled as requiring human review |
| **Product value** | Advisor flow: score → inspect → fix → approve → PDF. Realistic client data, real Exact Online OAuth, real check amounts |

---

## Expected questions + answers

**Q: How do you know the numbers are correct?**
A: Every check amount traces back to specific GL entries we show inline. The source lines
table shows date, account code, amount, description — exactly what's in the Exact Online
journal.

**Q: What if the AI hallucinates?**
A: We never let the AI invent numbers. The check engine runs deterministically on the raw
data first. The AI only gets called after the check results are computed — it interprets
facts, it doesn't create them.

**Q: Why not just use ChatGPT?**
A: ChatGPT doesn't have access to the client's Exact Online data. It would have to hallucinate
or ask the advisor to copy-paste. We pull live data via OAuth, run validated checks, and
give Claude only verified facts to reason about.

**Q: What's "guided diagnosis mode"?**
A: When a blocker exists (uncleared suspense account), we can't be confident the data is
clean enough for a full advisory. The system flags this to the advisor and lets them proceed
with awareness rather than hard-blocking. The advisor takes professional responsibility.

**Q: How does the score work?**
A: 1.0 minus penalties. Blocker = -0.20, high severity = -0.20, medium = -0.10. Any
blocker also forces `advice_ready = False` regardless of the numeric score.

**Q: Is this production-ready?**
A: It's a hackathon prototype, but the OAuth integration is real (Exact Online division
4453885), the data is live, and the PDF is production-quality. The main gap for production
is multi-client support and persistent storage instead of module-level caches.

---

## Fallback plan

| Failure | Recovery |
|---|---|
| Exact Online OAuth expired | Use cached `analysis_result` in localStorage — the UI shows the last run without a re-fetch |
| Claude API slow/unavailable | The readiness check and all data tables still work (only insights/fix plan need Claude) |
| PDF generation fails (WeasyPrint) | Explain: "The PDF feature requires system libraries — works in production, dependency issue on demo machine" |
| Backend crash | `uvicorn backend_FastAPI_emma.main:app --host 127.0.0.1 --port 8000 --reload --workers 1` in 5 seconds |
| Score looks different from expected | The live Exact Online data may have changed since testing — explain the check logic verbally |

---

## Key numbers for talking points

- **Overall score:** ~40% (FY2024, division 4453885)
- **Suspense account blocker:** €39,893 across ~39 entries (account 1250)
- **Revenue reconciliation gap:** GL 8xxx vs sales sum
- **VAT gap:** ~€145,000 discrepancy between GL account 1870 and tax PDF total
- **AR stale:** open receivables > 90 days
- **Passing checks (4):** timing differences, CIT preliminary deviation, VAT provisional correction, AP aging
- **DSO:** ~18 days (sector: ~30 days — actually healthy)
- **DPO:** ~35 days
