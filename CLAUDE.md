# Consult&Co — Financial Readiness Tool

Closing-readiness + data quality engine for Fietsatelier Morgenwind BV (Dutch bicycle workshop). Responsible AI demo: system refuses to call Claude if data is dirty.

## Team split
- **Toyesh:** data ingestion (`data_loader.py`), normalization (`normalizer.py`), readiness engine (`readiness_engine.py`), 11 check modules, tests
- **Emma:** FastAPI routes, Anthropic API calls, Next.js frontend
- **Shared:** `models.py` — never change unilaterally; coordinate with partner first

## Branch workflow
- Branches: `toyesh`, `emma`, `main`
- Only tested, verified code goes to `main` — merge 1–2x per day
- Always `git fetch origin && git merge origin/main` into your branch before starting
- Never push to `main` without a heads-up to partner

## Data
- Local files in `00 Dataroom hackathon/` — NEVER push to git (financial client data, already in .gitignore)
- Exact Online API = production stretch goal only; demo uses local files

## Test command
```
pytest tests/test_integration.py -v
```

## Key invariants
- `advice_ready: bool` on `DataReadinessReport` gates all Claude API calls — if False, no AI advice
- Any check with `severity="blocker"` → `advice_ready = False`
- Scoring: `1.0 - penalties`; high=0.20, medium=0.10, low=0.03; ready at score ≥ 0.6

## Dutch column names (confirmed from actual files)
| File type | Column | Meaning |
|---|---|---|
| GL entries | `boekdatum` | booking date |
| GL entries | `bedrag` | signed amount |
| GL entries | `grootboekrekening` | account code |
| GL entries | `omschrijving` | description |
| GL entries | `boekstuknummer` | record/document ID |
| GL entries | `periode` | accounting period |
| Bank entries | `datum` | date |
| Bank entries | `bedrag` | amount |
| Bank entries | `naam` | counterparty name |
| Bank entries | `code` | counterparty code |

Account code ranges: `0xxx`=CAPEX, `1250`=suspense/clearing ("Nog te duiden"), `1300`=AR, `1700`=AP, `1870`=VAT, `4xxx`=OPEX, `7xxx`=COGS, `8xxx`=revenue

## Loading quirks
- `header=1` for relations (01) and opening_balances (02) files — row 0 is Dutch section labels, row 1 is real header
- `header=None` for sales (04) and purchase (05) files — no header row, use positional mapping
- Dates: `dayfirst=True` (Dutch DD-MM-YYYY format)
- Amounts: strip `€`, replace `,` with `.`
- Relations sheet name: `"Invoerblad relaties"`

## Check IDs (locked — must match Emma's frontend)

| check_id | severity | trigger |
|---|---|---|
| `suspense_account_balance` | blocker | any GL entry on account 1250 |
| `todo_discrepancy` | high | count/amount diff in to-do folder files |
| `revenue_reconciliation` | high | GL 8xxx ≠ sales sum >1% |
| `capex_opex_misclassification` | medium | asset keywords in 4xxx >€1000 |
| `bank_statement_coverage` | medium | <90% business day coverage |
| `ar_aging_stale` | medium | open receivables >90 days |
| `timing_differences` | medium | GL `periode` ≠ `boekdatum.month` |
| `vat_reconciliation` | medium | GL VAT ≠ PDF total >1% |
| `cit_preliminary_deviation` | medium | provisional CIT ≠ final assessment >10% |
| `vat_provisional_correction` | medium | multiple VAT payments per quarter in tax schedule |
| `ap_aging_stale` | medium | open payables >90 days |

Note: `draft_entries` does NOT exist — dropped Day 1 (no status column in data). `todo_discrepancy` is its replacement. Tell Emma to remove `draft_entries` from her frontend.

Day 3 additions (3 new checks): `cit_preliminary_deviation`, `vat_provisional_correction`, `ap_aging_stale` — added based on organiser email hints about CIT/VAT provisional filings and AP aging. Emma needs frontend cards for all three.
