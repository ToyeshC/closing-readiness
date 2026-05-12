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
