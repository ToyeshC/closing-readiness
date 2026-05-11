# Harness Engine — Claude Code Specification
> **Who this is for:** Claude Code, acting as my pair programmer  
> **What I am building:** The data ingestion, normalization, and readiness assessment engine for a financial AI tool built for Consult&Co.'s hackathon (11–15 May 2026)  
> **My role in the team:** I own everything from raw data files → normalized dataset → readiness report. My partner owns FastAPI routes, Anthropic API calls, and the Next.js frontend. We meet at `models.py`.

---

## Project Overview

We are building a closing readiness and financial data quality tool for **Fietsatelier Morgenwind BV**, a Dutch bicycle workshop. The tool ingests their messy SME administration from Google Drive files (Excel, CSV, PDF), runs a series of deterministic quality checks, produces a structured readiness report, and gates any AI-generated advice behind a readiness score.

**The core principle:** No AI reasoning runs on dirty data. The harness engine is the gatekeeper. If it says the data isn't ready, Claude never gets called.

**Stack:** Python 3.11, FastAPI (my partner handles the API layer), Pydantic v2 for all models, pandas for data loading, pdfplumber for PDF extraction.

---

## Repository Structure (my part)

```
/backend
├── models.py                        # shared contract — defined with partner, both import from here
├── services/
│   ├── data_loader.py               # loads all files from Google Drive folder → FinancialDataset
│   ├── normalizer.py                # raw file rows → typed, clean internal records
│   ├── readiness_engine.py          # orchestrates all checks → DataReadinessReport
│   └── checks/
│       ├── __init__.py
│       ├── suspense.py
│       ├── drafts.py
│       ├── revenue_reconciliation.py
│       ├── capex_opex.py
│       ├── bank_coverage.py
│       ├── ar_aging.py
│       ├── timing_differences.py
│       └── vat_reconciliation.py
└── tests/
    ├── conftest.py                  # shared fixtures — make_dataset_with(), make_clean_dataset()
    ├── test_suspense.py
    ├── test_drafts.py
    ├── test_revenue_reconciliation.py
    ├── test_capex_opex.py
    ├── test_bank_coverage.py
    └── test_scoring.py
```

---

## The Shared Data Contract (`models.py`)

This file is defined jointly with my partner. I must not change it unilaterally. Current agreed version:

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
    raw: dict            # full original record — never discard this

class ReadinessCheck(BaseModel):
    check_id: str        # snake_case, e.g. "suspense_account_balance"
    label: str           # human-readable, e.g. "Suspense account balance"
    status: Literal["pass", "warn", "fail", "blocker"]
    severity: Literal["low", "medium", "high", "blocker"]
    description: str     # what is wrong and why it matters, in plain English
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
```

---

## Source Data — Google Drive Files

All files are downloaded locally to a known folder path before the engine runs. The engine does not fetch from Google Drive at runtime.

### Root folder files

| File | Maps to in FinancialDataset | Notes |
|---|---|---|
| `data_dictionary.md` | — | Read first. Defines column names for all Excel/CSV files. |
| `external_asset_register.xlsx` | `asset_register` | Fixed assets, purchase dates, depreciation |
| `2023_annual_summary_by_client.xlsx` | — | Prior year benchmark — used for anomaly comparison, not in main dataset |
| `intercompany_register.csv` | `intercompany` | Small file — intercompany relationships |
| `tax_payment_schedule.csv` | `tax_schedule` | Scheduled tax payments |

### `import_files_final/` folder

| File | Maps to | Notes |
|---|---|---|
| `01_relations_debtors_creditors_import.xlsx` | `relations` | Master debtor/creditor list — join everything else against this |
| `05_bank_cash_entries_2024_import.xlsx` | `bank_entries` (2024) | Bank transactions |
| `05_bank_cash_entries_2025_import.xlsx` | `bank_entries` (2025) | Append to 2024 |
| `07_item_groups_optional_import.xlsx` | `item_groups` | Product categories |
| `08_items_optional_import.xlsx` | `items` | Product catalogue — large file |

### `import_files_final/to do/` subfolder

**Critical:** This subfolder contains versions of files that may not yet be imported into the main administration. The presence of this folder is itself a data quality signal. Load these files separately and compare record counts / amounts against the main files. If they differ, that difference is a readiness finding.

| File | Compare against |
|---|---|
| `01_relations_debtors_creditors_import_daughter.xlsx` | `01_relations...` in parent |
| `02_opening_balance_2024_01_01_import.xlsx` | `opening_balances` |
| `03_general_journal_entries_2024_2025_import.xlsx` | `gl_entries` |
| `04_sales_entries_2024_2025_import.xlsx` | `sales_entries` |
| `05_purchase_entries_2024_2025_import.xlsx` | `purchase_entries` |
| `06_bank_cash_entries_2024en2025_import - kopie.xlsx` | `bank_entries` |

### `invoices/` folder

- `invoices/sales/` — PDFs named `sales_V240001_ClientName_BV.pdf`
- `invoices/purchase/` — PDFs named `purchase_I240001_SupplierName_BV.pdf`

**V24xxxx** = Verkoop (sales) 2024, **I24xxxx** = Inkoop (purchase) 2024.

The structured Excel files are the primary data source. PDFs are used only for: (1) verifying a specific flagged transaction, (2) extracting VAT/CIT totals from tax return PDFs. Use `pdfplumber` for PDF text extraction.

### Tax statement PDFs (`fietsatelier_morgenwind_tax_statements_filed/`)

| File | Use in engine |
|---|---|
| `VAT_returns_2024_filed.pdf` | Extract VAT totals for reconciliation check |
| `VAT_returns_2025_filed.pdf` | Extract VAT totals for reconciliation check |
| `CIT_final_statement_2024_filed.pdf` | Extract taxable profit for CIT consistency check |
| `CIT_final_statement_2025_filed.pdf` | Extract taxable profit for CIT consistency check |
| `CIT_provisional_statement_*.pdf` | Secondary reference |
| `Wage_tax_statement_*.pdf` | Payroll context — lower priority |

---

## Actual Column Names From the Data

> **Fill this in after reading `data_dictionary.md` and opening `03_general_journal_entries_2024_2025_import.xlsx`.**  
> This section is intentionally blank — do not proceed to writing check logic until you have filled it in.  
> The check implementations below use placeholder column names that must be replaced with real ones.

### GL entries (`03_general_journal_entries...`)
```
date column:          [FILL IN]
amount column:        [FILL IN]
debit column:         [FILL IN — or is it a signed single amount?]
credit column:        [FILL IN — or is it a signed single amount?]
account code column:  [FILL IN]
account name column:  [FILL IN]
description column:   [FILL IN]
status column:        [FILL IN — what values mean draft vs posted?]
record ID column:     [FILL IN]
period column:        [FILL IN — if separate from date]
```

### Sales entries (`04_sales_entries...`)
```
date column:          [FILL IN]
invoice number:       [FILL IN]
debtor ID:            [FILL IN — how does it join to relations file?]
amount excl VAT:      [FILL IN]
VAT amount:           [FILL IN]
account code:         [FILL IN]
```

### Purchase entries (`05_purchase_entries...`)
```
date column:          [FILL IN]
invoice number:       [FILL IN]
creditor ID:          [FILL IN]
amount excl VAT:      [FILL IN]
VAT amount:           [FILL IN]
account code:         [FILL IN]
description:          [FILL IN]
```

### Bank entries (`05_bank_cash_entries...`)
```
date column:          [FILL IN]
amount column:        [FILL IN — signed or separate debit/credit?]
counterparty:         [FILL IN]
description:          [FILL IN]
statement number:     [FILL IN — if present]
```

### Relations (`01_relations...`)
```
ID column:            [FILL IN]
name column:          [FILL IN]
type column:          [FILL IN — debtor vs creditor?]
account code:         [FILL IN]
```

### Account code ranges (fill in after reading data dictionary)
```
Suspense/transitional accounts:   [FILL IN — likely 19xx range]
Asset accounts (CAPEX):           [FILL IN — likely 0xxx range]
Operating expense accounts:       [FILL IN — likely 4xxx range]
Revenue accounts:                 [FILL IN — likely 8xxx range]
VAT accounts:                     [FILL IN]
Intercompany accounts:            [FILL IN]
```

---

## `data_loader.py` — Specification

### Responsibilities
- Load every file from the local data folder
- Return a fully populated `FinancialDataset`
- Handle encoding issues, mixed date formats, numeric parsing failures gracefully
- Log (don't crash) on rows that can't be parsed — keep them in a `parsing_errors` list

### Function signature
```python
async def load_all(
    data_folder: Path,
    period_start: date,
    period_end: date
) -> FinancialDataset:
    ...
```

### Loading pattern (apply to every Excel/CSV file)
```python
import pandas as pd
from pathlib import Path

def load_excel_sheet(path: Path, sheet_name: str | int = 0) -> list[dict]:
    df = pd.read_excel(path, sheet_name=sheet_name)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    # parse dates — handle multiple formats
    for col in df.select_dtypes(include=["object"]).columns:
        if "date" in col or "datum" in col:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors="coerce").dt.date
    # parse amounts
    for col in df.select_dtypes(include=["object"]).columns:
        if any(kw in col for kw in ["amount", "bedrag", "debit", "credit"]):
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(",", ".").str.replace("€", "").str.strip(),
                errors="coerce"
            )
    return df.to_dict(orient="records")
```

### `to do` subfolder handling
Load both the main file and the `to do` version. If record counts differ by more than 5%, or total amounts differ by more than 1%, store the discrepancy for use in a readiness check. Do not merge them — keep them separate.

---

## `normalizer.py` — Specification

### Responsibilities
- Map raw loaded records to `SourceLine` objects where needed
- Assign stable `record_id` values (use row index + file name if no natural ID exists)
- Ensure all monetary amounts are `float`, all dates are `datetime.date`
- Handle None/NaN values — replace with sensible defaults or flag

### Key function
```python
def to_source_line(
    record: dict,
    entity: str,
    record_id: str,
    amount_field: str,      # [FILL IN actual column name]
    date_field: str,        # [FILL IN actual column name]
    account_field: str,     # [FILL IN actual column name]
    description_field: str  # [FILL IN actual column name]
) -> SourceLine:
    return SourceLine(
        entity=entity,
        record_id=record_id,
        account_code=str(record.get(account_field, "")),
        amount=float(record.get(amount_field) or 0),
        date=record.get(date_field),
        description=str(record.get(description_field, "")),
        raw=record
    )
```

---

## `readiness_engine.py` — Specification

### The engine class

```python
from models import FinancialDataset, DataReadinessReport, ReadinessCheck

class ReadinessEngine:
    def __init__(self, dataset: FinancialDataset):
        self.dataset = dataset

    def run(self) -> DataReadinessReport:
        checks = [
            check_suspense_accounts(self.dataset),
            check_draft_entries(self.dataset),
            check_revenue_reconciliation(self.dataset),
            check_capex_opex(self.dataset),
            check_bank_coverage(self.dataset),
            check_ar_aging(self.dataset),
            check_timing_differences(self.dataset),
            check_vat_reconciliation(self.dataset),
            check_todo_folder_discrepancy(self.dataset),  # new — see below
        ]
        score, advice_ready = compute_score(checks)
        return DataReadinessReport(
            dataset=self.dataset,
            overall_score=score,
            advice_ready=advice_ready,
            checks=checks,
        )
```

### Scoring function

```python
def compute_score(checks: list[ReadinessCheck]) -> tuple[float, bool]:
    if any(c.severity == "blocker" and c.status != "pass" for c in checks):
        return 0.0, False

    score = 1.0
    penalties = {"high": 0.20, "medium": 0.10, "low": 0.03}
    for c in checks:
        if c.status in ("warn", "fail"):
            score -= penalties.get(c.severity, 0)

    score = max(0.0, round(score, 2))
    advice_ready = score >= 0.6
    return score, advice_ready
```

---

## Readiness Checks — Full Specifications

Each check lives in its own file under `checks/`. Every check follows this exact return pattern — always return a `ReadinessCheck`, even on pass. Never raise an exception from a check — catch internally and return a warn with description if something goes wrong.

---

### Check 1: Suspense account balance (`checks/suspense.py`)
**Severity:** blocker  
**Logic:** Any non-zero net balance on suspense/transitional accounts means unclassified transactions exist. Every downstream figure is untrustworthy until resolved.

```python
# Account codes and name keywords — fill in after reading data dictionary
SUSPENSE_CODE_RANGES = [
    # [FILL IN — e.g. range(1900, 2000)]
]
SUSPENSE_NAME_KEYWORDS = [
    "tussenrekening", "memoriaal", "te verrekenen",
    "overlopend", "suspense", "clearing", "transitoir",
    # [ADD any others found in the actual chart of accounts]
]

def is_suspense_account(account_code: str, account_name: str) -> bool:
    try:
        code = int(str(account_code).split(".")[0])
        if any(code in r for r in SUSPENSE_CODE_RANGES):
            return True
    except (ValueError, TypeError):
        pass
    name_lower = str(account_name).lower()
    return any(kw in name_lower for kw in SUSPENSE_NAME_KEYWORDS)

def check_suspense_accounts(dataset: FinancialDataset) -> ReadinessCheck:
    suspense_lines = [
        entry for entry in dataset.gl_entries
        if is_suspense_account(
            entry.get("[ACCOUNT_CODE_FIELD]", ""),
            entry.get("[ACCOUNT_NAME_FIELD]", "")
        )
    ]

    net_balance = sum(float(e.get("[AMOUNT_FIELD]", 0)) for e in suspense_lines)

    if abs(net_balance) > 0.01:
        return ReadinessCheck(
            check_id="suspense_account_balance",
            label="Suspense account balance",
            status="blocker",
            severity="blocker",
            description=(
                f"Net balance of €{net_balance:,.2f} remains in suspense accounts. "
                f"These transactions have not been classified and distort all financial figures."
            ),
            affected_amount=abs(net_balance),
            source_lines=[to_source_line(e, "gl_entry", ...) for e in suspense_lines]
        )

    return ReadinessCheck(
        check_id="suspense_account_balance",
        label="Suspense account balance",
        status="pass",
        severity="blocker",
        description="No unresolved suspense account balances found.",
        affected_amount=None,
        source_lines=[]
    )
```

---

### Check 2: Draft / unposted entries (`checks/drafts.py`)
**Severity:** blocker  
**Logic:** GL entries with draft/concept status are not officially posted. They appear in the ledger but haven't been confirmed, meaning all totals are provisional.

```python
# Fill in after inspecting the GL file
DRAFT_STATUS_VALUES = [
    # [FILL IN — e.g. "concept", "draft", "D", 0, False]
]
STATUS_FIELD = "[FILL IN]"

def check_draft_entries(dataset: FinancialDataset) -> ReadinessCheck:
    draft_entries = [
        e for e in dataset.gl_entries
        if e.get(STATUS_FIELD) in DRAFT_STATUS_VALUES
    ]

    if not draft_entries:
        return ReadinessCheck(
            check_id="draft_entries",
            label="Draft / unposted entries",
            status="pass",
            severity="blocker",
            description="All GL entries are posted.",
            affected_amount=None,
            source_lines=[]
        )

    total = sum(abs(float(e.get("[AMOUNT_FIELD]", 0))) for e in draft_entries)

    return ReadinessCheck(
        check_id="draft_entries",
        label="Draft / unposted entries",
        status="blocker",
        severity="blocker",
        description=(
            f"{len(draft_entries)} GL entries ({total:,.2f} total) are in draft status and not yet posted. "
            f"Financial figures are provisional until these are confirmed or deleted."
        ),
        affected_amount=total,
        source_lines=[to_source_line(e, "gl_entry", ...) for e in draft_entries]
    )
```

---

### Check 3: Revenue reconciliation (`checks/revenue_reconciliation.py`)
**Severity:** high (fail) / medium (warn)  
**Logic:** Sum of sales invoice amounts for the period should match the revenue line on the P&L. A gap > 2% means missing invoices or posting errors. The deck's own example: 5% gap = advice is 100% worthless.

```python
# Thresholds
FAIL_THRESHOLD = 0.05   # 5% gap → fail
WARN_THRESHOLD = 0.02   # 2% gap → warn

def extract_pl_revenue(dataset: FinancialDataset) -> float:
    """
    Extract revenue total from GL entries by summing revenue account codes.
    Revenue account range: [FILL IN after reading data dictionary]
    """
    revenue_entries = [
        e for e in dataset.gl_entries
        if is_revenue_account(e.get("[ACCOUNT_CODE_FIELD]", ""))
        and is_within_period(e.get("[DATE_FIELD]"), dataset.period_start, dataset.period_end)
    ]
    return sum(float(e.get("[AMOUNT_FIELD]", 0)) for e in revenue_entries)

def extract_invoice_revenue(dataset: FinancialDataset) -> float:
    return sum(
        float(e.get("[AMOUNT_EXCL_VAT_FIELD]", 0))
        for e in dataset.sales_entries
        if is_within_period(e.get("[DATE_FIELD]"), dataset.period_start, dataset.period_end)
    )

def check_revenue_reconciliation(dataset: FinancialDataset) -> ReadinessCheck:
    pl_revenue = extract_pl_revenue(dataset)
    invoice_revenue = extract_invoice_revenue(dataset)

    if pl_revenue == 0:
        return ReadinessCheck(
            check_id="revenue_reconciliation",
            label="Revenue reconciliation",
            status="warn",
            severity="high",
            description="Could not extract revenue from GL — no revenue account entries found in period.",
            affected_amount=None,
            source_lines=[]
        )

    delta = abs(pl_revenue - invoice_revenue)
    delta_pct = delta / pl_revenue

    if delta_pct > FAIL_THRESHOLD:
        status, severity = "fail", "high"
        desc = (
            f"Revenue gap of {delta_pct:.1%} (€{delta:,.2f}). "
            f"P&L shows €{pl_revenue:,.2f} but sales invoices total €{invoice_revenue:,.2f}. "
            f"At this gap, financial advice based on revenue figures is unreliable."
        )
    elif delta_pct > WARN_THRESHOLD:
        status, severity = "warn", "medium"
        desc = (
            f"Minor revenue gap of {delta_pct:.1%} (€{delta:,.2f}). "
            f"P&L: €{pl_revenue:,.2f} vs invoices: €{invoice_revenue:,.2f}. Monitor."
        )
    else:
        status, severity = "pass", "high"
        desc = f"Revenue reconciles within tolerance. P&L: €{pl_revenue:,.2f}, invoices: €{invoice_revenue:,.2f}."

    return ReadinessCheck(
        check_id="revenue_reconciliation",
        label="Revenue reconciliation",
        status=status,
        severity=severity,
        description=desc,
        affected_amount=delta if status != "pass" else None,
        source_lines=[]  # source lines = the invoices contributing to the gap — add if status != pass
    )
```

---

### Check 4: CAPEX booked as OPEX (`checks/capex_opex.py`)
**Severity:** high  
**Logic:** Fietsatelier Morgenwind buys physical goods — bikes, frames, batteries, tools. Some of these are fixed assets (CAPEX, should go to balance sheet) not operating expenses (OPEX, goes to P&L). A misclassification means wrong depreciation, wrong asset base, wrong profit.

```python
# Fietsatelier-specific asset keywords — refine after seeing actual invoice descriptions
ASSET_KEYWORDS = [
    # Bike/parts specific
    "fiets", "e-bike", "frame", "wiel", "battery", "accu", "fork", "vork",
    # General asset keywords
    "machine", "apparaat", "installatie", "verbouwing", "inventaris",
    "meubilair", "computer", "laptop", "server", "voertuig", "auto",
    "lease", "equipment", "hardware",
    # [ADD more after reading actual purchase invoice descriptions]
]

OPEX_ACCOUNT_RANGE = [
    # [FILL IN — e.g. range(4000, 7000)]
]

def is_likely_capex(description: str) -> bool:
    desc_lower = str(description).lower()
    return any(kw in desc_lower for kw in ASSET_KEYWORDS)

def is_opex_account(account_code: str) -> bool:
    try:
        code = int(str(account_code).split(".")[0])
        return any(code in r for r in OPEX_ACCOUNT_RANGE)
    except (ValueError, TypeError):
        return False

def check_capex_opex(dataset: FinancialDataset) -> ReadinessCheck:
    flagged = [
        e for e in dataset.purchase_entries
        if is_likely_capex(e.get("[DESCRIPTION_FIELD]", ""))
        and is_opex_account(e.get("[ACCOUNT_CODE_FIELD]", ""))
    ]

    if not flagged:
        return ReadinessCheck(
            check_id="capex_opex_misclassification",
            label="CAPEX / OPEX misclassification",
            status="pass",
            severity="high",
            description="No likely asset purchases found booked to operating expense accounts.",
            affected_amount=None,
            source_lines=[]
        )

    total = sum(float(e.get("[AMOUNT_FIELD]", 0)) for e in flagged)
    return ReadinessCheck(
        check_id="capex_opex_misclassification",
        label="CAPEX / OPEX misclassification",
        status="fail",
        severity="high",
        description=(
            f"{len(flagged)} purchase entries (€{total:,.2f}) appear to be capital assets "
            f"booked as operating expenses. This understates the asset base and overstates costs."
        ),
        affected_amount=total,
        source_lines=[to_source_line(e, "purchase_entry", ...) for e in flagged]
    )
```

---

### Check 5: Bank statement coverage (`checks/bank_coverage.py`)
**Severity:** high  
**Logic:** If there are business days in the analysis period with no bank statement lines, transactions on those days are unverifiable. Missing statements are a common cause of reconciliation failures.

```python
from datetime import timedelta

def get_business_days(start: date, end: date) -> set[date]:
    days = set()
    current = start
    while current <= end:
        if current.weekday() < 5:  # Monday–Friday
            days.add(current)
        current += timedelta(days=1)
    return days

def check_bank_coverage(dataset: FinancialDataset) -> ReadinessCheck:
    period_business_days = get_business_days(dataset.period_start, dataset.period_end)
    covered_days = set(
        e.get("[DATE_FIELD]")
        for e in dataset.bank_entries
        if e.get("[DATE_FIELD]") is not None
    )
    gap_days = period_business_days - covered_days
    gap_count = len(gap_days)

    if gap_count == 0:
        status, severity = "pass", "high"
        desc = "Bank statements cover all business days in the analysis period."
    elif gap_count <= 5:
        status, severity = "warn", "medium"
        desc = f"{gap_count} business day(s) have no bank statement entries. May indicate missing statements."
    else:
        status, severity = "fail", "high"
        desc = (
            f"{gap_count} business days have no bank statement entries. "
            f"Transactions on these days cannot be verified against bank records."
        )

    return ReadinessCheck(
        check_id="bank_statement_coverage",
        label="Bank statement coverage",
        status=status,
        severity=severity,
        description=desc,
        affected_amount=None,
        source_lines=[]
    )
```

---

### Check 6: AR aging — stale open items (`checks/ar_aging.py`)
**Severity:** medium  
**Logic:** Open receivables older than 90 days with no matching payment suggest either missing payment records or bad debt that hasn't been provisioned. Both distort the working capital picture.

```python
STALE_DAYS_THRESHOLD = 90

def check_ar_aging(dataset: FinancialDataset) -> ReadinessCheck:
    """
    Identify open sales entries (unpaid) older than STALE_DAYS_THRESHOLD days.
    'Open' means: no matching bank entry credit for that debtor/amount.
    Implementation detail: join sales_entries to bank_entries on debtor ID + amount.
    Mark unmatched sales entries as open.
    """
    # [IMPLEMENT: match sales entries to bank entries]
    # This requires knowing the join keys between sales_entries and bank_entries
    # Fill in join field names after reading data dictionary

    stale_open = []  # populate from matching logic above

    if not stale_open:
        return ReadinessCheck(
            check_id="ar_aging_stale",
            label="AR aging — stale open items",
            status="pass",
            severity="medium",
            description=f"No open receivables older than {STALE_DAYS_THRESHOLD} days found.",
            affected_amount=None,
            source_lines=[]
        )

    total = sum(float(e.get("[AMOUNT_FIELD]", 0)) for e in stale_open)
    return ReadinessCheck(
        check_id="ar_aging_stale",
        label="AR aging — stale open items",
        status="warn",
        severity="medium",
        description=(
            f"{len(stale_open)} open receivables older than {STALE_DAYS_THRESHOLD} days "
            f"totalling €{total:,.2f}. May indicate missing payment records or unprovided bad debt."
        ),
        affected_amount=total,
        source_lines=[to_source_line(e, "sales_entry", ...) for e in stale_open]
    )
```

---

### Check 7: Timing differences (`checks/timing_differences.py`)
**Severity:** medium  
**Logic:** An invoice dated in December but posted in January affects the wrong period's figures. Flag any entry where invoice date and posting date cross a month boundary — especially critical at period end.

```python
def crosses_month_boundary(invoice_date: date, posting_date: date) -> bool:
    if invoice_date is None or posting_date is None:
        return False
    return (invoice_date.year, invoice_date.month) != (posting_date.year, posting_date.month)

def check_timing_differences(dataset: FinancialDataset) -> ReadinessCheck:
    """
    Compare invoice date vs posting date on both sales and purchase entries.
    Flag where these cross a month boundary.
    Requires: invoice_date field AND posting_date field in entries.
    Fill in actual field names after reading data dictionary.
    """
    flagged = []
    for e in dataset.sales_entries + dataset.purchase_entries:
        inv_date = e.get("[INVOICE_DATE_FIELD]")
        post_date = e.get("[POSTING_DATE_FIELD]")
        if crosses_month_boundary(inv_date, post_date):
            flagged.append(e)

    if not flagged:
        return ReadinessCheck(
            check_id="timing_differences",
            label="Period timing differences",
            status="pass",
            severity="medium",
            description="No cross-period timing differences detected.",
            affected_amount=None,
            source_lines=[]
        )

    total = sum(abs(float(e.get("[AMOUNT_FIELD]", 0))) for e in flagged)
    return ReadinessCheck(
        check_id="timing_differences",
        label="Period timing differences",
        status="warn",
        severity="medium",
        description=(
            f"{len(flagged)} entries have invoice dates and posting dates in different months. "
            f"These affect period-specific figures and may distort monthly comparisons."
        ),
        affected_amount=total,
        source_lines=[to_source_line(e, "entry", ...) for e in flagged]
    )
```

---

### Check 8: VAT reconciliation (`checks/vat_reconciliation.py`)
**Severity:** medium  
**Logic:** Sum VAT on all invoices. Compare to VAT totals on the filed VAT return PDFs. A mismatch suggests missing invoices or incorrect VAT coding.

```python
import pdfplumber
import re

def extract_vat_from_pdf(pdf_path: Path) -> float | None:
    """
    Extract the total VAT payable figure from a filed VAT return PDF.
    The exact field label will vary — inspect the actual PDF to confirm.
    Common labels in Dutch VAT returns: "Te betalen", "Totaal", "Rubriek 5d"
    """
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        # [FILL IN: regex to extract the right number from the PDF text]
        # Inspect the actual VAT return PDF first and find the label/pattern
        match = re.search(r"[FILL IN PATTERN]", text)
        if match:
            return float(match.group(1).replace(".", "").replace(",", "."))
    except Exception:
        return None
    return None

def check_vat_reconciliation(dataset: FinancialDataset, vat_pdf_path: Path) -> ReadinessCheck:
    invoice_vat = sum(
        float(e.get("[VAT_AMOUNT_FIELD]", 0))
        for e in dataset.sales_entries + dataset.purchase_entries
        if is_within_period(e.get("[DATE_FIELD]"), dataset.period_start, dataset.period_end)
    )

    filed_vat = extract_vat_from_pdf(vat_pdf_path)

    if filed_vat is None:
        return ReadinessCheck(
            check_id="vat_reconciliation",
            label="VAT reconciliation",
            status="warn",
            severity="medium",
            description="Could not extract VAT total from filed return PDF. Manual check required.",
            affected_amount=None,
            source_lines=[]
        )

    delta = abs(invoice_vat - filed_vat)
    delta_pct = delta / filed_vat if filed_vat else 0

    if delta_pct > 0.01:
        status = "fail"
        desc = (
            f"VAT mismatch of {delta_pct:.1%} (€{delta:,.2f}). "
            f"Invoices: €{invoice_vat:,.2f} vs filed return: €{filed_vat:,.2f}. "
            f"Possible missing invoices or incorrect VAT coding."
        )
    else:
        status = "pass"
        desc = f"VAT reconciles within tolerance. Invoices: €{invoice_vat:,.2f}, filed: €{filed_vat:,.2f}."

    return ReadinessCheck(
        check_id="vat_reconciliation",
        label="VAT reconciliation",
        status=status,
        severity="medium",
        description=desc,
        affected_amount=delta if status == "fail" else None,
        source_lines=[]
    )
```

---

### Check 9: `to do` folder discrepancy (new)
**Severity:** high  
**Logic:** The `to do` subfolder in `import_files_final` contains files that may not yet be imported into the main administration. If the amounts in these files differ from the main files, the dataset is incomplete by design.

```python
def check_todo_folder_discrepancy(dataset: FinancialDataset) -> ReadinessCheck:
    """
    Compare record counts and total amounts between main import files
    and the 'to do' subfolder versions.
    Load both in data_loader.py and pass discrepancy metadata into the dataset
    or as a separate parameter.
    
    [IMPLEMENT after loading both versions in data_loader.py]
    """
    pass
```

---

## Tests — Specification (`tests/`)

### `conftest.py` — shared fixtures

```python
import pytest
from datetime import date
from models import FinancialDataset

def make_clean_dataset() -> FinancialDataset:
    """A minimal dataset with no known issues — all checks should pass."""
    # [IMPLEMENT: build a small but complete dataset with no anomalies]
    # Use realistic Dutch account codes and plausible Fietsatelier amounts
    pass

def make_dataset_with(**overrides) -> FinancialDataset:
    """
    Start from a clean dataset and inject specific issues.
    Usage examples:
      make_dataset_with(suspense_balance=4230.00)
      make_dataset_with(pl_revenue=100000, invoice_revenue=93000)
      make_dataset_with(draft_entry_count=5)
    """
    base = make_clean_dataset()
    # [IMPLEMENT: apply overrides to inject specific conditions]
    pass
```

### Three tests you must be able to run live during the demo

```python
# test_suspense.py
def test_suspense_blocker_halts_advice():
    dataset = make_dataset_with(suspense_balance=4230.00)
    report = ReadinessEngine(dataset).run()
    assert report.advice_ready is False
    assert report.overall_score == 0.0
    check = next(c for c in report.checks if c.check_id == "suspense_account_balance")
    assert check.status == "blocker"
    assert check.affected_amount == pytest.approx(4230.00, rel=0.01)
    assert len(check.source_lines) > 0
    assert all(sl.entity == "gl_entry" for sl in check.source_lines)

# test_revenue_reconciliation.py
def test_revenue_gap_flagged():
    dataset = make_dataset_with(pl_revenue=100_000, invoice_revenue=93_000)  # 7% gap
    report = ReadinessEngine(dataset).run()
    check = next(c for c in report.checks if c.check_id == "revenue_reconciliation")
    assert check.status == "fail"
    assert check.severity == "high"
    assert check.affected_amount == pytest.approx(7_000, rel=0.01)

# test_scoring.py
def test_clean_dataset_passes():
    dataset = make_clean_dataset()
    report = ReadinessEngine(dataset).run()
    assert report.advice_ready is True
    assert report.overall_score >= 0.8
    assert all(c.status == "pass" for c in report.checks)
```

---

## Critical Rules for Claude Code to Follow

1. **Never change `models.py` without flagging it.** My partner builds against it simultaneously. Any change breaks her code.

2. **Never raise an exception from inside a check function.** Wrap everything in try/except and return a `warn` status with a description if something fails unexpectedly. The engine must always return a complete report.

3. **Always populate `source_lines` on non-pass results.** A check that fires without source lines is useless to the advisor and fails the traceability judging criterion.

4. **Always keep the `raw` field in `SourceLine`.** Never discard the original record. This is the audit trail.

5. **Fill in all `[FILL IN]` placeholders before implementing check logic.** Do not guess column names — inspect the actual data first.

6. **No AI in the engine.** The readiness engine is 100% deterministic Python. No calls to Claude, no probabilistic logic. Claude is called by my partner's reasoning service, only after this engine returns `advice_ready = True`.

7. **Token awareness.** I am using Claude Code for development. Keep sessions focused. Start a new session when context gets long.

---

## Questions to Bring to the Wednesday Expert Session

1. "In a standard Dutch BV's Exact Online chart of accounts, which account code ranges are used for suspense and transitional accounts? Are there naming conventions we can rely on across clients?"

2. "For a fietsatelier (bicycle workshop), what's the right accounting treatment for bikes held as inventory vs bikes used as fixed assets? How do we distinguish them from purchase invoice data alone?"

3. "When you reconcile bank statements manually, do you match by date + amount + counterparty, or is there a statement reference number that links directly to GL entries?"

---

## Demo Moment (what my engine enables)

During the Friday pitch, the sequence that wins is:

1. Readiness report loads with 2–3 specific failing checks
2. Advisor clicks "Show source" on the suspense account check → sees exact GL lines
3. System shows blocked advisory screen with reason: *"€4,230 in unclassified suspense account entries. Revenue figures cannot be trusted until resolved."*
4. That moment — the system refusing to hallucinate — is the responsible AI criterion

Everything I build leads to that moment.
