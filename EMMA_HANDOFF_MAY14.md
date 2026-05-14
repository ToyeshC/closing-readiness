# Emma Handoff — May 14 Session (Toyesh → Emma)

This file documents the backend changes Toyesh made on May 14 that affect Emma's frontend work.

---

## Files Emma must NOT edit (Toyesh is modifying these)

- `backend/models.py` — new fields and models added
- `backend_FastAPI_emma/schemas.py` — new imports and fields added
- `backend_FastAPI_emma/services/reasoning.py` — JSON bug fixed
- `backend/services/financial_ratios.py` — new aging functions added
- `backend_FastAPI_emma/routers/analyze.py` — new routes added

If Emma needs to change any of these files, coordinate with Toyesh first to avoid merge conflicts.

---

## Bug Fixed: Advisory JSON Rendering

**What changed:** `call_claude_guided()` in `reasoning.py` now strips markdown fences from the LLM response before returning. Previously, Claude sometimes wrapped the JSON in ` ```json ``` ` fences, causing the frontend to display raw JSON instead of parsed guidance cards.

**Impact on Emma's frontend:** None required. The `GuidedDiagnosis` component in `advisory/page.tsx` was already correct — it tries to `JSON.parse(raw)` and the fix means that parse will now succeed. The component will now render the numbered guidance cards as intended instead of falling back to raw text.

---

## New API Fields: AR/AP Aging Breakdown

**What changed:** The analysis response now includes per-counterparty aging breakdowns under `readiness.ratios.ar_aging_detail` and `readiness.ratios.ap_aging_detail`.

**Schema:**
```typescript
interface AgingEntry {
  counterparty: string;
  amount: number;           // gross EUR
  aging_bucket: string;     // "0-30", "31-60", "61-90", "90+", or "—" (Other)
  invoice_ref: string | null;
}

// Now in AnalysisResult.readiness.ratios:
ar_aging_detail: AgingEntry[];   // top debtors by open amount
ap_aging_detail: AgingEntry[];   // top creditors by open amount
```

**Impact on Emma's frontend:** These are new optional array fields — existing frontend code won't break. Emma can add AR/AP aging tables to the Report page whenever she's ready. Details on the suggested UI are in `deferred.txt`.

---

## New Endpoint: Fix Plan Generation

**What changed:** Two new API routes:

```
POST /api/v1/fix-plan
Query params: period_start (date, optional), period_end (date, optional)
Returns: FixPlan
```

```
PUT /api/v1/fix-plan/{plan_id}/approve
Body: { approved_items: string[], notes: string }
Returns: { logged: true, plan_id: string, approved_items: string[] }
```

**FixPlan schema:**
```typescript
interface FixPlanItem {
  check_id: string;
  issue_summary: string;
  proposed_action: string;
  affected_accounts: string[];
  estimated_effort: string;    // "< 5 minutes" | "30 minutes" | "1-2 hours" | "Half day" | "Requires accountant review"
  confidence: "high" | "medium" | "low";
  risk_level: "low" | "medium" | "high";
  supporting_data: string[];
}

interface FixPlan {
  plan_id: string;         // UUID
  generated_at: string;    // ISO datetime
  period_start: string;
  period_end: string;
  items: FixPlanItem[];
  ai_disclosure: string;   // pre-filled EU AI Act disclosure text
}
```

**Impact on Emma's frontend:** No immediate changes required. When Emma builds the fix-plan UI, the endpoint is ready. Suggested UI spec is in `deferred.txt`.

---

## New Field in AnalysisResult: Sector Benchmarks

**What changed:** The top-level `AnalysisResult` response now includes `sector_benchmarks`.

**Schema:**
```typescript
interface SectorBenchmarks {
  sector_name: string;
  sbi_code: string;
  source: string;            // "CBS StatLine SBS 2022 / ..." — always citable
  reference_year: number;
  gross_margin_median: number | null;    // 0.42 = 42%
  revenue_per_fte_median: number | null; // EUR
  dso_days_approx: number | null;
  dpo_days_approx: number | null;
  notes: string;
}

// In AnalysisResult:
sector_benchmarks: SectorBenchmarks | null;
```

**Impact on Emma's frontend:** Optional field — existing code won't break. When Emma adds the comparative benchmarks view, the data is available. Suggested UI is in `deferred.txt`.

---

## How to Merge Emma's Work

1. Emma finishes her frontend work on her branch
2. Emma PRs to `toyesh` branch (NOT main directly) — this lets Toyesh review the API contract changes
3. Toyesh pulls Emma's branch into `toyesh`
4. Toyesh tests the full stack together
5. Then push to `main` as one merge

**Important:** Do NOT push directly to `main`. Work only on feature branches and `toyesh` branch.

---

## Emma's Local Setup (reminder)

She needs from Toyesh:
1. The `00 Dataroom hackathon/` folder (gitignored — share via USB/Drive)
2. An `ANTHROPIC_API_KEY` (from hackathon dataroom)
3. A `LANGWATCH_API_KEY`

She does NOT need Exact Online OAuth — system auto-detects no token and loads local files.

```bash
# Fill in .env: ANTHROPIC_API_KEY, LANGWATCH_API_KEY, FRONTEND_URL=http://localhost:3000

# Backend
pip install -r requirements.txt
uvicorn backend_FastAPI_emma.main:app --host 127.0.0.1 --port 8000 --reload --workers 1

# Frontend (new terminal)
cd frontend && npm install && npm run dev

# Open http://localhost:3000 — runs on local data, no Exact Online needed
```
