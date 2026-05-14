# Judge Demo Walkthrough — Consult&Co Financial Readiness Tool

**Duration:** ~8 minutes
**Driver:** Toyesh (engine) or Emma (frontend) — decide before judges arrive
**Data:** Fietsatelier Morgenwind BV, FY2024

---

## Setup (before judges arrive)
- [ ] Exact Online OAuth already authenticated (`GET /auth/exact/status` → `{"authenticated": true}`)
- [ ] Backend running on Railway (or locally if deploy failed)
- [ ] Frontend open in browser, connected to backend
- [ ] ngrok running and forwarding to `:8000`
- [ ] Fallback: local engine smoke test ready in terminal (`python3 -c "..."` snippet in README)

---

## Step 1 — The problem (30 seconds, verbal)

> "Accountants want to use AI to advise clients at closing time. But AI on dirty data gives
> dangerous advice. We built a readiness gate: the engine checks the books first, and only
> calls Claude when the data is clean enough."

---

## Step 2 — Connect to Exact Online (live OAuth)

Click **Connect to Exact Online** → complete OAuth flow → backend confirms `division_id`.

> "This is a live connection to the client's bookkeeping system — no file uploads, no CSV
> exports. The accountant connects once and the engine reads directly from the source."

---

## Step 3 — Run the readiness engine

Click **Analyse FY2024**. Engine runs in ~2 seconds. Show the score dashboard.

**Expected results (local files — confirmed):**
- Score: ~50% | `advice_ready: False`
- BLOCKER: `suspense_account_balance` — 8 GL entries on account 1250, €39,893
- FAIL: `revenue_reconciliation` — GL 8xxx vs sales sum mismatch
- FAIL: `ap_aging_stale` — 26 invoices >90 days, €45,412
- FAIL: `ar_aging_stale` — 14 invoices >90 days, €39,703
- Ratios: DSO ~36 days, DPO ~93 days, Working capital €26,483

**Exact Online data may differ** — same checks, potentially different values.

---

## Step 4 — Responsible AI gate (the core demo moment)

Point to `advice_ready = False`.

> "Because there's a blocker — uncleared suspense entries — we don't call the standard
> advisory. Instead we call Claude in diagnosis mode."

Show the `guided_response`: a structured list of what to fix, ordered by impact.

> "This is the responsible AI principle: Claude guides the accountant to clean the data
> first. It never gives a closing opinion on books with known issues."

---

## Step 5 — Show score delta (score_after_fix)

Point to each failing check's **"Fix this → score goes to X%"** label.

> "Clearing the suspense account alone takes you from 50% to 70% and unlocks the full advisory.
> Fix AP aging and you reach 80%. The accountant has a clear, prioritised action list."

Note: blockers show **"Fix this → unlocks the advisory"** rather than a score number
(they gate `advice_ready` via a separate flag, not the numeric score).

---

## Step 6 — Financial ratios

> "DSO: 36 days. DPO: 93 days. Working capital: €26,483."

> "DPO of 93 days means they're taking 3 months to pay suppliers.
> Dutch SME benchmark is 30–60 days. This is a flag worth raising with the client —
> and on clean data, Claude would call this out in the full advisory."

---

## Step 7 — If advice_ready were True

> "On a clean dataset, here's what the advisory looks like:"

Show a pre-run screenshot OR briefly clear the suspense entries and re-run if time allows.

Example advisory output:
> "DPO 93 days vs Dutch SME benchmark ~45 days — may be straining supplier relationships.
> Recommend a structured AP programme. DSO 36 days is within range; AR aging issue is
> isolated to 14 invoices totalling €39,703 — flag for follow-up."

---

## Likely judge questions

**Q: "How do you handle hallucinations?"**
> "Deterministic Python checks the numbers first. Claude never sees raw data — only the
> engine's structured output (check IDs, amounts, dates). Every claim in the advisory
> is backed by a specific GL entry we can show."

**Q: "What if the client's books are always clean — is this useful?"**
> "The ratios and benchmarking are always valuable. And in practice, >80% of Dutch SME
> closings have at least one data quality issue. The gate exists for when it matters."

**Q: "Can this be used for any client?"**
> "Engine is client-agnostic. Add a client by connecting their Exact Online account.
> The data loader handles standard Dutch bookkeeping exports (Excel/CSV) as fallback
> if they're not on Exact Online."

**Q: "What does the accountant actually do with this?"**
> "They see a prioritised list: fix suspense entries, clear AP aging, reconcile VAT.
> Each failing check shows exactly which GL entries or invoices are the problem —
> source lines with amounts, dates, and account codes. No hunting through spreadsheets."

---

## Contingency

| Problem | Response |
|---|---|
| OAuth fails | Fall back to local files (same engine, same demo) — say "In production this connects live; for today's demo we've pre-loaded the data" |
| Railway down | Run locally: `uvicorn backend_FastAPI_emma.main:app --reload` |
| Claude API slow | Show the raw `guided_response` JSON — the structured output is itself the story |
| Frontend crashes | Run the smoke test in terminal and narrate the output |
