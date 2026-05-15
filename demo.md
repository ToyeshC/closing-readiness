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

---

## Financial jargon — quick reference

This section is for us (non-finance people). Memorise a few before the demo.

### The big picture

**Closing the books / year-end closing**
At the end of a financial year, a company has to produce official financial statements: the
balance sheet (what you own vs. what you owe) and the P&L (did you make money?). "Closing
the books" is the process of making sure every transaction is recorded, categorised, and
reconciled before those statements are signed off. If the data is messy, the statements
are wrong — which is an audit risk and potentially a legal issue.

**Closing readiness**
How ready is the data for year-end close? Our tool scores this 0–100%. A score below 60%
means the books have enough issues that an AI advisory could give wrong advice. That's why
we check first.

**General Ledger (GL)**
The master record of every financial transaction the company has made. Each entry has a
date, an amount, and an account code (like 1250, 8001). In Exact Online, this is called
"Grootboek" in Dutch. Everything else (invoices, bank statements, VAT) feeds into the GL.

**Account codes**
Companies categorise transactions by account code. Fietsatelier Morgenwind uses:
- `1250` — suspense/clearing account (catch-all for unclassified entries)
- `1300` — accounts receivable (money customers owe)
- `1700` — accounts payable (money the company owes suppliers)
- `1870` — VAT payable/receivable
- `4xxx` — operating expenses (OPEX: rent, salaries, repairs)
- `0xxx` — capital expenditure (CAPEX: equipment purchases)
- `7xxx` — cost of goods sold
- `8xxx` — revenue

### The 10 checks — what each one means

**Suspense account balance (BLOCKER)**
Account 1250 is a "parking lot" for transactions the bookkeeper hasn't classified yet.
Think of it as a drawer where you throw receipts to sort later. If there's money sitting
there at year-end, the books are incomplete — you don't know if that money is revenue,
an expense, or an asset. Our client has €39,893 unclassified. This is the blocker.

**Revenue reconciliation (FAIL)**
The GL shows revenue in accounts 8xxx. There's also a separate sales invoice file.
These two numbers should match. If they don't (>1% gap), either invoices are missing
from the GL, or the GL has revenue entries with no invoice. Our client's gap is large —
likely because not all sales were posted to the GL during the year.

**CapEx/OpEx misclassification (FAIL)**
CapEx (Capital Expenditure) = buying long-term assets (a new bike-repair machine, a van).
OpEx (Operating Expenditure) = running costs (electricity, rent, wages). The difference
matters for tax: OpEx is fully deducted in the current year, CapEx is depreciated over
several years. If a €40,000 machine purchase is posted to account 4xxx (OpEx) instead of
0xxx (CapEx), the tax calculation is wrong. We look for keywords like "machine",
"inventaris" (inventory), "activa" (assets) in OpEx accounts.

**Bank statement coverage (FAIL)**
Every business day of the year should have at least one bank statement entry. If there
are gaps (say, no bank activity recorded for 3 weeks in August), it either means the
bookkeeper hasn't imported those statements yet, or there's a missing data source.
Our check counts business days covered: <90% coverage = fail.

**AR aging — stale receivables (FAIL)**
Accounts Receivable (AR) = invoices you've sent to customers that haven't been paid yet.
If an invoice is more than 90 days old and still "open" (unpaid), it's suspicious — it
might be a bad debt (customer won't pay), or it might be a bookkeeping error (payment was
received but not matched). Either way, the balance sheet is wrong. We found €22,854 in
invoices older than 90 days.

**Timing differences (PASS)**
Every GL entry has a "booking date" (when the transaction happened) and an "accounting
period" (which month it's assigned to). They should match. If an October invoice is
posted to September (to make the September numbers look better), that's a timing
manipulation — or just a bookkeeping mistake. We check all entries; this client passes.

**VAT reconciliation (FAIL)**
VAT = Value Added Tax (BTW in Dutch). Dutch companies charge 21% VAT on most sales and
pay VAT on purchases, then settle the difference with the tax authority quarterly. The
company submits official VAT returns (tax PDFs). Our check compares the VAT amount in
the GL (account 1870) against the official VAT return PDFs. If they differ by >1%,
either the GL is wrong or the tax return was filed incorrectly. Our client has a ~€145,000
gap — serious.

**CIT preliminary deviation (PASS)**
CIT = Corporate Income Tax (Vennootschapsbelasting in Dutch). Companies pay a "provisional
assessment" (advance payment) of corporate tax mid-year based on an estimate, then settle
with the actual tax bill later. If the provisional payment differs from the final
assessment by >10%, it signals either poor financial forecasting or an error. This client
passes.

**VAT provisional correction (PASS)**
If a company makes multiple VAT payments in a single quarter (a "correction"), it might
signal an error was found and corrected — which is fine — or it could indicate messy VAT
records. We check for this pattern across all quarters.

**AP aging — stale payables (PASS)**
Accounts Payable (AP) = invoices from suppliers that the company hasn't paid yet. Same
logic as AR aging: if you owe a supplier for more than 90 days, either the invoice wasn't
paid (cash flow problem) or the payment wasn't matched in the system. This client passes.

### Financial ratios — what they mean

**DSO — Days Sales Outstanding**
How many days on average does it take customers to pay their invoices? Formula: (open AR
÷ revenue) × days in period. Lower = faster payment = better cash flow. 18 days is
excellent for a bike workshop; sector average is ~30 days.

**DPO — Days Payable Outstanding**
How many days does the company take to pay its suppliers? Higher can be good (you're
keeping cash longer) or bad (you're late on payments). 35 days is typical.

**Working Capital**
Current assets minus current liabilities. Basically: if you had to pay all your short-term
debts today, how much would you have left? Positive = financially healthy.
Formula here: Open AR − Open AP.

**Gross Profit Margin**
(Revenue − Cost of Goods Sold) ÷ Revenue. What percentage of each euro of sales is profit
after paying for the goods/parts sold. Does not include overhead (rent, salaries).

---

## LangWatch audit trail — what it is and why we built it

### What is LangWatch?

LangWatch is an AI observability platform — think of it like application monitoring, but
for AI calls. Every time our system calls Claude (Anthropic's AI), LangWatch records:
- The exact prompt sent
- The model used (claude-sonnet-4-6)
- The response received
- How long it took
- A unique `trace_id` that links the AI call to the readiness report that triggered it

You can see all traces at: https://app.langwatch.ai (Toyesh's account)

### Why we built it in

The hackathon brief asked for "responsible AI" and "explainability." The biggest risk with
AI in finance is that an advisor trusts the output without understanding where it came from.
The LangWatch audit trail solves this:

1. **Every AI output is traceable.** The PDF report includes a `trace_id`. If a client
   asks "why did you recommend reclassifying that entry?", the advisor can pull up the
   exact prompt and response in LangWatch.

2. **Approvals are logged.** When the advisor clicks "Approve selected" on the fix plan,
   the system records which check_ids were approved and by whom. This is the human-in-the-loop
   step: AI proposes, human decides.

3. **The readiness guardrail is a traced span.** Even the decision "this data is too messy
   to give advice" is recorded as a LangWatch span. Judges can see that the system didn't
   just call Claude blindly — it ran 10 deterministic checks first, then decided whether
   to allow the AI call.

### What to say about it in the demo

"Every Claude call goes through LangWatch. That trace_id at the bottom of the report page
links this advisory to the exact prompt Claude received. If we're ever asked to justify an
AI recommendation, we have a full audit trail — not just the output, but the input."

Show the trace_id on the Report page (bottom of the hero section) or in the PDF.
