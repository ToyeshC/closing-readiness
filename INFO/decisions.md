# Architectural Decisions — Consult&Co Readiness Engine

Non-obvious choices made during the hackathon. Use this when judges ask "why did you do it this way?"

---

## Scoring formula

**Choice:** `score = 1.0 - sum(penalties)` where high=0.20, medium=0.10, low=0.03. `advice_ready = True` when score ≥ 0.60 and no blockers.

**Why:** Simple to explain live in 10 seconds. Thresholds map directly to severity labels — a judge can verify the math in their head. Alternatives like weighted averages or ML-based scoring would require explanation time we don't have.

---

## timing_differences: GL Periode vs boekdatum.month (not boekdatum vs vervaldatum)

**Choice:** Compare the GL `Periode` field (integer 1–12) against `boekdatum.month`. Flag entries where these differ.

**Why:** Comparing `boekdatum` (booking date) against `vervaldatum` (due date) flags every normal 30/60-day payment term as an error — nearly every invoice would trigger it. `Periode` is the accounting period the entry is actually posted to, which is what matters for period-cutoff accuracy.

---

## draft_entries check dropped — replaced by todo_discrepancy

**Choice:** No `draft_entries` check_id. Replaced by `todo_discrepancy`.

**Why:** The GL export from Exact Online has no status column. There is no way to distinguish draft from posted entries from the data alone. The signal for "not yet imported" data is the presence of files in the `import_files_final/to do/` subfolder — that's what `todo_discrepancy` captures.

---

## header=1 for relations and opening_balances files

**Choice:** Load `01_relations...` and `02_opening_balance...` with `header=1`, not the default `header=0`.

**Why:** Row 0 in these files is Dutch section-label text (e.g., "Algemeen", "Financieel"), not column names. Row 1 is the real header. Loading with default `header=0` assigns section labels as column names and drops the real header.

---

## header=None for sales and purchase files

**Choice:** Load `04_sales...` and `05_purchase...` with `header=None` and positional column mapping.

**Why:** These files have no header row at all. Column assignments come from the Exact Online positional format documented in `data_loader.py`.

---

## Period default: 2024-01-01 to 2024-12-31

**Choice:** API defaults to calendar year 2024.

**Why:** Fietsatelier Morgenwind's book year is calendar 2024. Configurable via query params (`period_start`, `period_end`) if needed for other clients.

---

## 11 checks, not the original 9

**Choice:** Started with 9 check spec → dropped 1 (`draft_entries`) → added 3 (`cit_preliminary_deviation`, `vat_provisional_correction`, `ap_aging_stale`).

**Why:** `draft_entries` was dropped because the data doesn't support it (see above). The three new checks were added on Day 3 based on organiser emails that explicitly hinted at CIT provisional assessments, VAT correction filings, and AP aging as areas of interest. All three have supporting data in the hackathon dataset.

---

## AP aging: match purchase entries to outgoing bank entries

**Choice:** Flag purchase entries (positive `bedrag`) with no matching negative bank entry within 1% tolerance, where the invoice is >90 days old.

**Why:** Same logic as AR aging but inverted — purchase entries are what we owe; negative bank entries are outgoing payments. The 1% tolerance covers minor rounding differences between invoice amounts and actual bank transfers (e.g., early payment discounts).

---

## CIT check: compare provisional vs final PDFs, not GL accounts

**Choice:** Extract CIT liability from both `CIT_provisional_statement_2024_filed.pdf` and `CIT_final_statement_2024_filed.pdf` using `pdfplumber`.

**Why:** There are no CIT-specific GL entries in the dataset (GL account 1880 is in the tax schedule, not the GL). The PDFs are the authoritative source for filed CIT figures.

---

## VAT provisional check: tax_schedule payment counts per quarter

**Choice:** Count VAT payment rows per quarter in `tax_payment_schedule.csv`. Multiple payments for the same quarter = correction filing signal.

**Why:** GL account 1870 has zero entries in the dataset — VAT doesn't appear in the GL. The tax schedule is the only source of payment-level granularity. A correction filing would appear as an additional payment row for the same quarter reference.

---

## Financial ratios: greedy amount-matching, period-filtered

**Choice:** Open AR/AP computed by matching invoice amounts to bank entries using a greedy pool (exact key first, then within 1% tolerance). Period filter applied: only invoices dated within `[period_start, period_end]` counted.

**Why:** The sales/purchase entry files cover 2024 and 2025. Without period filtering, 2025 invoices inflated open AR from €91K to €280K, pushing DSO from 36 days to 199 days. The 1% tolerance covers common rounding differences between invoiced and paid amounts. Same logic as existing ar_aging/ap_aging checks — consistent by design.

---

## UX pivot: advice_ready=False triggers guided-diagnosis, not hard block

**Choice:** When `advice_ready=False`, still call Claude with a guidance-mode system prompt (list of failing checks + amounts). Returns a prioritised fix list. The readiness gate is still the gatekeeper — Claude never produces a closing advisory on dirty data — but it can explain what to fix.

**Why:** Organiser feedback on Day 4: "If the model says no, it should say why no and what to fix." A hard block with a status message leaves the user stuck. Guided diagnosis keeps the "responsible AI" story while being actually useful. Claude advises on the data quality problem, not on the financial data itself.

---

## CIT check: absolute € threshold added alongside percentage threshold

**Choice:** `cit_preliminary_deviation` warns if `abs(provisional - final) > €5,000` regardless of the percentage deviation (`_WARN_ABSOLUTE = 5_000.0`).

**Why:** Organiser explicitly flagged this on Day 4: "5% of a large base is a large number." For a company with €96K CIT liability, a 3% deviation is €2,880 — fine. But if the base were €1M, 3% = €30K in interest exposure. The absolute threshold catches cases the percentage threshold misses.

---

## Exact Online loader: local file loading retained as fallback

**Choice:** `load_all_from_exact()` added alongside `load_all()` in `data_loader.py`. `analyze.py` picks the loader based on whether an OAuth token exists. Local file loading is not removed.

**Why:** Exact Online OAuth credentials not yet received at time of implementation. Demo must still work with local files. The field mapping is an internal detail of `load_all_from_exact()` — all checks consume `FinancialDataset` regardless of source, so zero check changes needed when switching loaders.
