# Partner Knowledge Base — Fietsatelier Morgenwind Hackathon
> **Your role:** FastAPI backend (routes, Anthropic integration) + Next.js frontend + deployment  
> **Your partner's role:** Harness engine — data loading, normalization, all readiness checks  
> **You meet at:** `models.py` and the `ReadinessEngine.run()` method signature

---

## 1. The Context

### The company
**Consult&Co.** (consultenco.nl) runs a hackathon 11–15 May 2026. The theme is AI in finance. You are building for them.

### The client company in the dataset
**Fietsatelier Morgenwind BV** — a Dutch bicycle workshop. The dataset represents their messy SME administration as it would arrive from a client: incomplete, not fully cleaned, not yet ready for financial advice.

### The problem being solved
Financial advisors currently spend hours manually cleaning client data before they can give any advice. The goal is a tool that:
1. Ingests the raw financial data
2. Runs a readiness assessment (finds what's broken and why)
3. If data is clean enough, calls Claude to generate structured financial analysis
4. Returns everything with full traceability — every number cited back to its source

### The user
**The advisor at Consult&Co.** — not the end client. The advisor loads a dataset, sees what's wrong, and gets AI-assisted analysis when the data is trustworthy enough.

---

## 2. Judging Criteria (build against these directly)

| # | Criterion | What it means for your code |
|---|---|---|
| 1 | Data modelling & validation | The readiness checks are rigorous and handle edge cases |
| 2 | Reliability | Robust under realistic usage — no crashes on bad data |
| 3 | Explainability & traceability | Every output traced back to source data |
| 4 | Responsible AI | No hallucinated numbers — system refuses to advise on dirty data |
| 5 | Product value | An advisor would actually use this in front of a client |

**Hard fail:** Hallucinations on numbers. The system must never output a number that didn't come from the source data.

---

## 3. The Shared Data Contract

Define this in `/backend/models.py` together on Monday. Both of you import from here — never duplicate these models.

```python
from pydantic import BaseModel
from typing import Literal
from datetime import date

class SourceLine(BaseModel):
    entity: str          # "gl_entry", "invoice", "bank_statement"
    record_id: str       # unique ID from source data
    account_code: str
    amount: float
    date: date
    description: str
    raw: dict            # full original record — never discard

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

class DataReadinessReport(BaseModel):
    dataset: FinancialDataset
    overall_score: float       # 0.0 to 1.0
    advice_ready: bool         # True only if zero blockers
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

## 4. The Stack

| Layer | Technology | Hosting |
|---|---|---|
| Backend | Python 3.11 + FastAPI | Railway |
| Frontend | Next.js 14 (TypeScript) | Vercel |
| AI | Anthropic API (`claude-sonnet-4-20250514`) | — |
| Data source | Google Drive files (Excel, CSV, PDF) | — |
| Later: live data | Exact Online API (credentials coming) | — |

### Why this stack
- FastAPI gives automatic Pydantic validation and auto-generated docs
- Next.js gives SSR so the deployed URL loads fast for judges
- Railway + Vercel = zero DevOps, push-to-deploy

---

## 5. Repo Structure

```
/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router registration
│   ├── models.py                # shared contract — defined together Monday
│   ├── routers/
│   │   └── analyze.py           # POST /analyze, GET /health
│   └── services/
│       ├── data_loader.py       # YOUR PARTNER OWNS THIS
│       ├── normalizer.py        # YOUR PARTNER OWNS THIS
│       ├── readiness_engine.py  # YOUR PARTNER OWNS THIS
│       ├── reasoning.py         # YOU OWN THIS — Anthropic API calls
│       └── checks/              # YOUR PARTNER OWNS THIS
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Screen 1: connect / upload
│   │   ├── report/
│   │   │   └── page.tsx         # Screen 2: readiness report
│   │   └── advisory/
│   │       └── page.tsx         # Screen 3: advisory outputs
│   └── components/
│       ├── ReadinessCard.tsx    # one check rendered
│       ├── SourceDrawer.tsx     # expandable source lines
│       └── OutputCard.tsx       # one advisory output rendered
├── .env                         # API keys — never commit
└── README.md
```

---

## 6. Your Backend Work

### `main.py`

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

app.include_router(analyze.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}
```

### `routers/analyze.py`

```python
from fastapi import APIRouter, HTTPException
from datetime import date
from models import AnalysisResult, DataReadinessReport
from services.readiness_engine import ReadinessEngine
from services.data_loader import load_all
from services.reasoning import call_claude

router = APIRouter()

@router.post("/analyze", response_model=AnalysisResult)
async def analyze(period_start: date, period_end: date):
    try:
        dataset = await load_all(period_start, period_end)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data loading failed: {str(e)}")

    readiness: DataReadinessReport = ReadinessEngine(dataset).run()

    if not readiness.advice_ready:
        blocker_checks = [c for c in readiness.checks if c.status == "blocker"]
        reason = f"{len(blocker_checks)} blocker(s) prevent advice: " + \
                 ", ".join(c.label for c in blocker_checks)
        return AnalysisResult(
            readiness=readiness,
            advisory_outputs=None,
            blocked_reason=reason
        )

    advisory_outputs = await call_claude(readiness)
    return AnalysisResult(
        readiness=readiness,
        advisory_outputs=advisory_outputs,
        blocked_reason=None
    )
```

### `services/reasoning.py` — the Anthropic integration

```python
import os
import json
import httpx
from models import DataReadinessReport, AdvisoryOutput, FinancialDataset

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
API_KEY = os.environ["ANTHROPIC_API_KEY"]

SYSTEM_PROMPT = """
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
      "source": "human-readable citation e.g. P&L revenue line, account 8000, Jan-Dec 2024",
      "source_record_ids": ["id1", "id2"],
      "confidence": "high|medium|low"
    }
  ]
}
"""

def build_context(readiness: DataReadinessReport) -> str:
    """
    Build a focused context string from the dataset.
    Do NOT dump the entire dataset — slice what's relevant.
    This keeps token usage low and citations accurate.
    """
    d = readiness.dataset
    return json.dumps({
        "period": {
            "start": str(d.period_start),
            "end": str(d.period_end)
        },
        "sales_summary": summarise_entries(d.sales_entries),
        "purchase_summary": summarise_entries(d.purchase_entries),
        "bank_summary": summarise_entries(d.bank_entries),
        "asset_register": d.asset_register[:20],  # cap to avoid token blowout
        "passed_checks": [
            {"check": c.check_id, "description": c.description}
            for c in readiness.checks if c.status == "pass"
        ],
        "warnings": [
            {"check": c.check_id, "description": c.description, "amount": c.affected_amount}
            for c in readiness.checks if c.status == "warn"
        ]
    }, default=str)

def summarise_entries(entries: list[dict]) -> dict:
    """Aggregate entries to key figures rather than sending every row."""
    if not entries:
        return {}
    total = sum(float(e.get("amount", 0)) for e in entries)
    return {
        "count": len(entries),
        "total": round(total, 2),
        "sample": entries[:3]  # a few rows so Claude understands the structure
    }

async def call_claude(readiness: DataReadinessReport) -> list[AdvisoryOutput]:
    context = build_context(readiness)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "system": SYSTEM_PROMPT,
                "messages": [
                    {
                        "role": "user",
                        "content": f"Analyse this financial dataset and produce structured outputs:\n\n{context}"
                    }
                ]
            }
        )
        response.raise_for_status()

    data = response.json()
    raw_text = "".join(
        block["text"] for block in data["content"] if block["type"] == "text"
    )

    # Strip markdown code fences if present
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        parsed = json.loads(raw_text)
        return [AdvisoryOutput(**o) for o in parsed["outputs"]]
    except Exception as e:
        # Never surface a parse failure as a hallucination — return empty
        return []
```

---

## 7. Token Budget — Important

The deck explicitly warns: **long chats burn tokens fast; API calls are more efficient. There is a per-account ceiling.**

In practice:
- Use `max_tokens: 1000` for analysis calls. Raise to 2000 only if outputs are being cut off.
- Slice data before sending — use `summarise_entries()` pattern above, not raw dumps.
- During development, use Claude Code over the chat UI wherever possible.
- Model to use: `claude-sonnet-4-20250514`

---

## 8. Your Frontend Work

### Three screens only — no more

**Screen 1 — Connect (`/`)**  
Form: period start, period end, submit button. Pre-fill with the hackathon dataset dates for the demo so it's one click.

**Screen 2 — Readiness Report (`/report`)**  
This is the most important screen. Judges spend the most time here.

- Large score at top (color: red <0.4, amber 0.4–0.8, green >0.8)
- `advice_ready` banner — green "Ready for analysis" or red "X blockers must be resolved"
- List of checks: each as a card with status icon, label, description, affected amount
- Each card has a "Show source" toggle that expands the underlying source lines in a table
- CTA at bottom: "View Advisory Output" (only active if `advice_ready === true`)

**Screen 3 — Advisory Output (`/advisory`)**  
Three sections: FACTS (teal), ASSUMPTIONS (amber), ADVICE (purple).  
Each output is a card with: statement, confidence badge, collapsible "Source" section showing `source` citation and linked record IDs.

### Key UI rule from the deck
"Strong submissions show clear thinking — not just shine." Keep it clean and functional. The readiness report screen doing its job well is worth more than a polished dashboard that glosses over data issues.

### Useful component sketch — `ReadinessCard.tsx`

```tsx
interface ReadinessCardProps {
  check: ReadinessCheck
}

const statusConfig = {
  pass:    { icon: "✓", color: "text-green-700 bg-green-50 border-green-200" },
  warn:    { icon: "⚠", color: "text-amber-700 bg-amber-50 border-amber-200" },
  fail:    { icon: "✗", color: "text-red-700 bg-red-50 border-red-200" },
  blocker: { icon: "⊘", color: "text-red-900 bg-red-100 border-red-400 font-bold" },
}

export function ReadinessCard({ check }: ReadinessCardProps) {
  const [open, setOpen] = useState(false)
  const config = statusConfig[check.status]

  return (
    <div className={`border rounded-lg p-4 ${config.color}`}>
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <span className="text-lg">{config.icon}</span>
          <div>
            <p className="font-medium">{check.label}</p>
            <p className="text-sm mt-1">{check.description}</p>
            {check.affected_amount && (
              <p className="text-sm mt-1">
                Affected amount: <strong>€{check.affected_amount.toLocaleString("nl-NL")}</strong>
              </p>
            )}
          </div>
        </div>
        {check.source_lines.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="text-sm underline whitespace-nowrap ml-4"
          >
            {open ? "Hide source" : `Show source (${check.source_lines.length})`}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs w-full border-collapse">
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
              {check.source_lines.map((line, i) => (
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
        </div>
      )}
    </div>
  )
}
```

---

## 9. Deployment

### Railway (backend)
1. Connect GitHub repo to Railway
2. Set root directory to `/backend`
3. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables: `ANTHROPIC_API_KEY`, `EXACT_ONLINE_API_KEY` (when available)
5. Deploy — push to `main` branch auto-deploys

### Vercel (frontend)
1. Connect GitHub repo to Vercel
2. Set root directory to `/frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app`
4. Deploy — push to `main` branch auto-deploys

**Do this on Monday. The submission requires a working URL by Friday 15:00.**

### `.env` (never commit this)
```
ANTHROPIC_API_KEY=...
EXACT_ONLINE_CLIENT_ID=...
EXACT_ONLINE_CLIENT_SECRET=...
```

---

## 10. The Dataset — What Your Partner Is Working With

The data lives in Google Drive under `00 Dataroom hackathon`. Your partner loads and normalizes all of it. You consume the `FinancialDataset` object that comes out.

**Folder structure:**
```
00 Dataroom hackathon/
├── fietsatelier_morgenwind_tax_statements_filed/
│   ├── CIT_final_statement_2024_filed.pdf
│   ├── CIT_final_statement_2025_filed.pdf
│   ├── CIT_provisional_statement_2024_filed.pdf
│   ├── CIT_provisional_statement_2025_filed.pdf
│   ├── VAT_returns_2024_filed.pdf
│   ├── VAT_returns_2025_filed.pdf
│   ├── Wage_tax_statement_2024_filed.pdf
│   └── Wage_tax_statement_2025_filed.pdf
├── import_files_final/
│   ├── to do/                          ← FLAG: may be unimported data
│   │   ├── 01_relations_debtors_creditors_import_daughter.xlsx
│   │   ├── 02_opening_balance_2024_01_01_import.xlsx
│   │   ├── 03_general_journal_entries_2024_2025_import.xlsx
│   │   ├── 04_sales_entries_2024_2025_import.xlsx
│   │   ├── 05_purchase_entries_2024_2025_import.xlsx
│   │   └── 06_bank_cash_entries_2024en2025_import - kopie.xlsx
│   ├── 01_relations_debtors_creditors_import.xlsx  ← customers & suppliers master list
│   ├── 05_bank_cash_entries_2024_import.xlsx       ← bank transactions 2024
│   ├── 05_bank_cash_entries_2025_import.xlsx       ← bank transactions 2025
│   ├── 07_item_groups_optional_import.xlsx         ← product categories
│   └── 08_items_optional_import.xlsx               ← product catalogue (265KB)
├── invoices/
│   ├── purchase/   ← PDFs named purchase_I240001_SupplierName_BV.pdf ...
│   └── sales/      ← PDFs named sales_V240001_ClientName_BV.pdf ...
├── 2023_annual_summary_by_client.xlsx              ← prior year benchmark
├── data_dictionary.md                              ← READ THIS FIRST
├── external_asset_register.xlsx                    ← fixed assets
├── intercompany_register.csv                       ← intercompany transactions
└── tax_payment_schedule.csv                        ← scheduled tax payments
```

**Important — the `to do` subfolder:** These files may represent data that hasn't been imported into the administration yet. This is itself a data quality finding. When the harness engine flags this, your frontend should surface it prominently on the readiness report.

**Invoice naming convention:**
- `V240001` = Verkoop (sales) invoice #001 of 2024
- `I240001` = Inkoop (purchase) invoice #001 of 2024

You don't need to parse the PDFs yourself. Your partner handles that if needed. You consume the structured output.

---

## 11. Readiness Checks — What Your Partner Builds (for your reference)

You don't build these, but you need to understand what they produce so you can display them correctly and gate the Claude call properly.

| Check ID | Severity | What it finds |
|---|---|---|
| `suspense_account_balance` | blocker | Non-zero balance on suspense/transitional accounts |
| `draft_entries` | blocker | GL entries with draft/concept status — not officially posted |
| `revenue_reconciliation` | high | Gap >2% between P&L revenue and sum of sales invoices |
| `capex_opex_misclassification` | high | Asset purchases (bikes, frames, equipment) booked as operating expenses |
| `bank_statement_coverage` | high | Business days in the period with no bank statement lines |
| `ar_aging_stale` | medium | Open receivables >90 days with no matching payment |
| `timing_differences` | medium | Invoices posted to wrong period (invoice date vs posting date crosses month boundary) |
| `vat_reconciliation` | medium | Mismatch between VAT on invoices and VAT on filed returns |

**Scoring:**
- Any blocker → `advice_ready = false`, `overall_score = 0.0`
- High severity fail → −0.20 per finding
- Medium severity fail → −0.10 per finding
- Low severity → −0.03 per finding
- Score ≥ 0.6 with no blockers → `advice_ready = true`

---

## 12. The Demo Script (Friday 15:00)

Practice this together Thursday evening. Under 10 minutes. No slides.

1. Open the app, explain in one sentence what it does
2. Run analysis on the messy dataset — readiness report loads
3. Walk through 2 failing checks — click "Show source" on each to reveal underlying records
4. Show the blocked advisory screen: "The system won't give advice because the data isn't ready"
5. Acknowledge or resolve one issue, re-run, partial clear
6. Advisory output loads — walk through one FACT (click source citation), one ASSUMPTION, one ADVICE
7. Closing line: "Every number is traceable. Every inference is labelled. And when the data isn't ready, the system says so."

**The moment that wins:** when the system refuses to produce advice because of a specific, named, sourced data issue. Design toward that scene.

---

## 13. Wednesday Expert Session — Questions Relevant to Your Work

Your partner will handle the data-layer questions. You should prepare:

- "When an advisor sees a flagged readiness issue, what do they want to do next — fix it in Exact Online and re-run, or annotate it and proceed with caveats?"
- "Would a traffic-light closing checklist (one row per check) be useful to show a client directly, or is it more of an internal pre-work view?"
- "For the advisory output — do advisors prefer a narrative summary or a structured list of findings?"

The answers shape your UI flow and output format.

---

## 14. What Good Looks Like (from the deck)

> *"Strong submissions show clear thinking — not just shine."*

The five things judges explicitly look for:
1. **Understands the mess** — names what makes the data unreliable and where
2. **Smart use of AI** — AI added where it adds real value, not superficial
3. **Reasoning & explainability** — every output traceable to data and logic
4. **Facts vs assumptions vs advice** — the product respects the difference and shows it
5. **An advisor would use it** — real workflow fit; they'd put it in front of a client

And the starred hard fail: **hallucinations on numbers**. Honesty wins.
