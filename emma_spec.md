# FastAPI + Frontend — Claude Code Specification
> **Who this is for:** Claude Code, acting as my pair programmer  
> **What I am building:** The FastAPI backend (routes, Anthropic integration) and Next.js frontend for a financial AI tool built for Consult&Co.'s hackathon (11–15 May 2026)  
> **My role in the team:** I own everything from the FastAPI layer outward — routes, Claude API calls, UI, and deployment. My partner owns data loading and readiness checks. We meet at `models.py` and `ReadinessEngine.run()`.

---

## Project Overview

We are building a closing readiness and financial data quality tool for **Fietsatelier Morgenwind BV**, a Dutch bicycle workshop. The partner's engine ingests raw financial data, runs deterministic quality checks, and produces a `DataReadinessReport`. My job is to expose that report via API, gate Claude behind it, display it in a clear UI, and deploy the whole thing before Friday 15:00.

**The core principle:** Claude only runs when `report.advice_ready == True`. I enforce this gate. I never call Claude on dirty data.

**Stack:** Python 3.11 + FastAPI (Railway), Next.js 14 TypeScript (Vercel), Anthropic API (`claude-sonnet-4-20250514`).

---

## Repository Structure (my part)

```
/backend
├── main.py                      # FastAPI app, CORS, router registration
├── models.py                    # shared contract — never change without Toyesh
├── routers/
│   └── analyze.py               # POST /api/v1/readiness, GET /api/v1/readiness/{id}/sources
└── services/
    ├── data_loader.py            # PARTNER OWNS — do not touch
    ├── normalizer.py             # PARTNER OWNS — do not touch
    ├── readiness_engine.py       # PARTNER OWNS — do not touch
    ├── checks/                   # PARTNER OWNS — do not touch
    └── reasoning.py              # I OWN — Anthropic API integration

/frontend
├── app/
│   ├── page.tsx                  # Screen 1: Connect / run check
│   ├── report/
│   │   └── page.tsx              # Screen 2: Readiness report
│   └── advisory/
│       └── page.tsx              # Screen 3: Advisory outputs
└── components/
    ├── ReadinessCard.tsx          # single check card with expandable source table
    ├── SourceDrawer.tsx           # expandable source lines panel
    └── OutputCard.tsx             # single advisory output card
```

---

## The Shared Data Contract (`models.py`)

This file is defined jointly with Toyesh. **Never change it unilaterally.** If a change is needed: agree verbally, one person edits, push to main, both pull.

The authoritative version lives on `main`. Current models:

```python
from pydantic import BaseModel
from typing import Literal
from datetime import date

class SourceLine(BaseModel):
    entity: str          # "gl_entry", "invoice", "bank_statement"
    record_id: str
    account_code: str
    amount: float
    date: date
    description: str
    raw: dict            # full original record — never discard this

class ReadinessCheck(BaseModel):
    check_id: str        # e.g. "suspense_account_balance"
    label: str           # e.g. "Suspense account balance"
    status: Literal["pass", "warn", "fail", "blocker"]
    severity: Literal["low", "medium", "high", "blocker"]
    description: str
    affected_amount: float | None
    source_lines: list[SourceLine]

class FinancialDataset(BaseModel):
    period_start: date
    period_end: date
    gl_entries: list[dict]
    opening_balances: list[dict]
    sales_entries: list[dict]
    purchase_entries: list[dict]
    bank_entries: list[dict]
    relations: list[dict]
    asset_register: list[dict]
    intercompany: list[dict]
    tax_schedule: list[dict]
    items: list[dict]
    item_groups: list[dict]
    todo_discrepancies: list[dict]  # files in to do/ vs main — populated by data_loader

class DataReadinessReport(BaseModel):
    dataset: FinancialDataset
    overall_score: float       # 0.0 to 1.0
    advice_ready: bool         # True only if zero blockers and score >= 0.6
    checks: list[ReadinessCheck]

class AdvisoryOutput(BaseModel):
    type: Literal["FACT", "ASSUMPTION", "ADVICE"]
    statement: str
    source: str                        # human-readable citation
    source_record_ids: list[str]       # machine-linkable back to raw data
    confidence: Literal["high", "medium", "low"]

class AnalysisResult(BaseModel):
    readiness: DataReadinessReport
    advisory_outputs: list[AdvisoryOutput] | None  # None if not advice_ready
    blocked_reason: str | None
```

---

## FastAPI Backend

### `backend/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analyze

app = FastAPI(title="Fietsatelier Morgenwind — Closing Readiness API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-vercel-url.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1")

@app.get("/health")
def health():
    return {"status": "ok"}
```

### `backend/routers/analyze.py`

Two endpoints:

**`POST /api/v1/readiness`**
- Body: `{ "period_start": "2024-01-01", "period_end": "2024-12-31" }`
- Triggers data loading + all 9 readiness checks (may take a few seconds)
- Returns: `DataReadinessReport`
- Gate: if `not report.advice_ready`, return `AnalysisResult` with `advisory_outputs=None` and `blocked_reason`

**`GET /api/v1/readiness/{check_id}/sources`**
- Returns: `list[SourceLine]` for the given `check_id`
- Used by the "Show source" button in the frontend
- Example: `GET /api/v1/readiness/suspense_account_balance/sources`
- Implementation: store the last report in memory (or a simple module-level dict); look up `check_id` in `report.checks`

```python
from fastapi import APIRouter, HTTPException
from datetime import date
from backend.models import AnalysisResult, DataReadinessReport, SourceLine
from backend.services.readiness_engine import ReadinessEngine
from backend.services.data_loader import load_all
from backend.services.reasoning import call_claude

router = APIRouter()
_last_report: DataReadinessReport | None = None  # module-level cache for source lookups

@router.post("/readiness", response_model=AnalysisResult)
async def run_readiness(period_start: date, period_end: date):
    global _last_report
    dataset = await load_all(period_start=period_start, period_end=period_end)
    report = ReadinessEngine(dataset).run()
    _last_report = report

    if not report.advice_ready:
        blockers = [c for c in report.checks if c.status == "blocker"]
        reason = f"{len(blockers)} blocker(s): " + ", ".join(c.label for c in blockers)
        return AnalysisResult(readiness=report, advisory_outputs=None, blocked_reason=reason)

    advisory_outputs = await call_claude(report)
    return AnalysisResult(readiness=report, advisory_outputs=advisory_outputs, blocked_reason=None)

@router.get("/readiness/{check_id}/sources", response_model=list[SourceLine])
def get_sources(check_id: str):
    if _last_report is None:
        raise HTTPException(status_code=404, detail="No readiness report available. Run POST /readiness first.")
    for check in _last_report.checks:
        if check.check_id == check_id:
            return check.source_lines
    raise HTTPException(status_code=404, detail=f"check_id '{check_id}' not found")
```

---

## Anthropic Integration (`backend/services/reasoning.py`)

### Critical rules

1. Only called when `report.advice_ready == True` — the route enforces this; reasoning.py trusts it
2. Every number in a `FACT` must appear verbatim in the data provided to Claude
3. Never send raw data dumps — slice and summarise (see `build_context` below)
4. `max_tokens=1000`; raise to 2000 only if outputs are being cut off
5. If JSON parsing fails, return `[]` — never surface a parse failure as a hallucinated output

### System prompt

```
You are a financial analysis assistant for a Dutch SME advisory firm (Consult&Co.).
You have been given structured financial data from Fietsatelier Morgenwind BV
that has passed a quality assessment and is ready for analysis.

Your outputs must each be exactly one of three types:
- FACT: directly and verifiably derivable from the provided data. No inference.
- ASSUMPTION: requires inference or extrapolation. State your reasoning explicitly.
- ADVICE: a recommendation. Must be grounded in named facts and stated assumptions.

Rules you must never break:
1. Every number you state must appear verbatim in the data provided.
2. Never produce a FACT from data flagged as potentially incomplete.
3. Cite the exact source for every FACT (entity, account code, period).
4. If uncertain, say so — an honest ASSUMPTION beats a confident hallucination.
5. Return JSON only. No prose outside the JSON.

Return format:
{
  "outputs": [
    {
      "type": "FACT|ASSUMPTION|ADVICE",
      "statement": "...",
      "source": "human-readable citation e.g. P&L revenue line, account 8000, Jan–Dec 2024",
      "source_record_ids": ["id1", "id2"],
      "confidence": "high|medium|low"
    }
  ]
}
```

### Context builder — what to send

```python
def build_context(readiness: DataReadinessReport) -> str:
    d = readiness.dataset
    return json.dumps({
        "period": {"start": str(d.period_start), "end": str(d.period_end)},
        "sales_summary": _summarise(d.sales_entries),
        "purchase_summary": _summarise(d.purchase_entries),
        "bank_summary": _summarise(d.bank_entries),
        "asset_register": d.asset_register[:20],       # cap — never send full list
        "warnings": [
            {"check": c.check_id, "description": c.description, "amount": c.affected_amount}
            for c in readiness.checks if c.status == "warn"
        ],
        "passed_checks": [c.check_id for c in readiness.checks if c.status == "pass"]
    }, default=str)

def _summarise(entries: list[dict]) -> dict:
    if not entries:
        return {}
    total = sum(float(e.get("bedrag", e.get("amount", 0))) for e in entries)
    return {"count": len(entries), "total": round(total, 2), "sample": entries[:3]}
```

Note: GL column name for amount is `bedrag` (Dutch). Sales/purchase are positional-loaded so keys are numeric strings — check via `entries[:1]` if unsure.

### API call skeleton

```python
async def call_claude(readiness: DataReadinessReport) -> list[AdvisoryOutput]:
    context = build_context(readiness)
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": f"Analyse this dataset:\n\n{context}"}]
            }
        )
        response.raise_for_status()
    raw = response.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    try:
        return [AdvisoryOutput(**o) for o in json.loads(raw)["outputs"]]
    except Exception:
        return []
```

---

## Readiness Checks Reference (partner builds these — display them correctly)

| check_id | severity | what it flags |
|---|---|---|
| `suspense_account_balance` | blocker | Non-zero balance on account 1250 (suspense/clearing) |
| `draft_entries` | blocker | Entries in `to do/` folder not yet imported |
| `revenue_reconciliation` | high | >2% gap between P&L revenue (8xxx) and sales invoices |
| `capex_opex_misclassification` | high | Asset purchases (bikes, frames) booked as OPEX (4xxx) |
| `bank_statement_coverage` | high | Business days in period with no bank statement lines |
| `ar_aging_stale` | medium | Open receivables >90 days with no matching payment |
| `timing_differences` | medium | Invoices posted to wrong period (invoice date vs posting date) |
| `vat_reconciliation` | medium | Mismatch between VAT on invoices and filed VAT returns |
| `todo_discrepancy` | high | Files in `to do/` subfolder flagged as potentially unimported |

**Scoring logic (implemented by partner — just display the result):**
- Any `blocker` → `advice_ready=False`, `overall_score=0.0`
- `high` fail → −0.20, `medium` → −0.10, `low` → −0.03
- Score ≥ 0.6 and no blockers → `advice_ready=True`

---

## Frontend (Next.js 14 TypeScript)

### Three screens only

**Screen 1 — Connect (`/`)**  
- Form: period start, period end, "Run readiness check" button
- Pre-fill dates with `2024-01-01` / `2024-12-31` for the demo (one-click run)
- On submit: `POST /api/v1/readiness` → navigate to `/report`

**Screen 2 — Readiness Report (`/report`)**  
The most important screen. Judges spend the most time here.

- Large score at top — colour: red <0.4, amber 0.4–0.8, green >0.8
- `advice_ready` banner: green "Ready for analysis" or red "X blocker(s) must be resolved"
- List of `ReadinessCard` components — one per check, ordered blockers first
- Each card: status icon, label, description, affected amount in euros, "Show source (N)" button
- "Show source" expands a table of the raw `SourceLine` records that triggered the check (calls `GET /api/v1/readiness/{check_id}/sources`)
- CTA at bottom: "View Advisory Output" — only active if `advice_ready === true`

Status colours: `pass` → green, `warn` → amber, `fail` → red, `blocker` → bold red.

**Screen 3 — Advisory Output (`/advisory`)**  
- Three sections: FACTS (teal), ASSUMPTIONS (amber), ADVICE (purple)
- Each `OutputCard`: statement, confidence badge, collapsible "Source" section showing `source` citation and `source_record_ids`

### `ReadinessCard.tsx` sketch

```tsx
const statusConfig = {
  pass:    { icon: "✓", color: "text-green-700 bg-green-50 border-green-200" },
  warn:    { icon: "⚠", color: "text-amber-700 bg-amber-50 border-amber-200" },
  fail:    { icon: "✗", color: "text-red-700 bg-red-50 border-red-200" },
  blocker: { icon: "⊘", color: "text-red-900 bg-red-100 border-red-400 font-bold" },
}

export function ReadinessCard({ check }: { check: ReadinessCheck }) {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<SourceLine[]>([])
  const config = statusConfig[check.status]

  const handleShowSource = async () => {
    if (!open && sources.length === 0) {
      const res = await fetch(`/api/v1/readiness/${check.check_id}/sources`)
      setSources(await res.json())
    }
    setOpen(!open)
  }

  return (
    <div className={`border rounded-lg p-4 ${config.color}`}>
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <span className="text-lg">{config.icon}</span>
          <div>
            <p className="font-medium">{check.label}</p>
            <p className="text-sm mt-1">{check.description}</p>
            {check.affected_amount != null && (
              <p className="text-sm mt-1">
                Affected: <strong>€{check.affected_amount.toLocaleString("nl-NL")}</strong>
              </p>
            )}
          </div>
        </div>
        {check.source_lines.length > 0 && (
          <button onClick={handleShowSource} className="text-sm underline ml-4 whitespace-nowrap">
            {open ? "Hide source" : `Show source (${check.source_lines.length})`}
          </button>
        )}
      </div>
      {open && sources.length > 0 && (
        <table className="mt-4 text-xs w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-1">Entity</th>
              <th className="text-left p-1">Account</th>
              <th className="text-left p-1">Date</th>
              <th className="text-right p-1">Amount</th>
              <th className="text-left p-1">Description</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((line, i) => (
              <tr key={i} className="border-b border-dashed">
                <td className="p-1">{line.entity}</td>
                <td className="p-1 font-mono">{line.account_code}</td>
                <td className="p-1">{line.date}</td>
                <td className="p-1 text-right font-mono">€{line.amount.toLocaleString("nl-NL")}</td>
                <td className="p-1">{line.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

---

## Deployment

### Railway (backend)

1. Connect GitHub repo → set root directory to `/backend`
2. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Environment variables: `ANTHROPIC_API_KEY`, `EXACT_ONLINE_CLIENT_ID`, `EXACT_ONLINE_CLIENT_SECRET`
4. Push to `main` → auto-deploys

### Vercel (frontend)

1. Connect GitHub repo → set root directory to `/frontend`
2. Environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app`
3. Push to `main` → auto-deploys

**Do this on Monday. Submission requires a working URL by Friday 15:00.**

### `.env` (never commit)

```
ANTHROPIC_API_KEY=...
EXACT_ONLINE_CLIENT_ID=...
EXACT_ONLINE_CLIENT_SECRET=...
```

### Exact Online OAuth (when credentials arrive)

Redirect URL to register in Exact Online App Center:
- Local dev: `http://localhost:8000/auth/callback`
- Production: `https://your-railway-url.railway.app/auth/callback`

```python
@app.get("/auth/callback")
async def exact_callback(code: str, state: str | None = None):
    # POST to https://start.exactonline.nl/api/oauth2/token
    # grant_type=authorization_code, code=code,
    # redirect_uri=..., client_id=..., client_secret=...
    # Store returned access_token + refresh_token
```

Division ID: visible in Exact Online URL when logged in (e.g. `_Division_=4453885`).  
API base: `https://start.exactonline.nl/api/v1/{division}/`

---

## Demo Sequence (Friday 15:00 — under 10 minutes)

Practice Thursday evening with Toyesh. No slides.

1. Open app → pre-filled dates → click "Run readiness check"
2. Readiness report loads — show the score, walk through 2 failing checks
3. Click "Show source" on each — show the raw Dutch GL rows that caused the issue
4. Blocked advisory screen: *"The system won't give advice because the data isn't ready"*
5. Acknowledge/resolve one issue, re-run — partial score increase
6. Advisory output loads — walk through one FACT (click source citation), one ASSUMPTION, one ADVICE
7. Closing line: *"Every number is traceable. Every inference is labelled. And when the data isn't ready, the system says so."*

**The moment that wins:** the system refusing to produce advice because of a specific, named, sourced data issue.

---

## Open Questions

| Question | Options | Status |
|---|---|---|
| Period dates source | A: Hardcode 2024-01-01 / 2024-12-31 for demo | B: Frontend date picker — align with Toyesh |
| `FinancialDataset.todo_discrepancies` field | Not in original `partner_knowledge_base.md` — added in handoff | Confirm field exists in partner's latest `models.py` before using |
