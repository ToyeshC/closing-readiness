# Data Files — Fietsatelier Morgenwind BV

All files are in `00 Dataroom hackathon/`. This folder is excluded from git (financial client data).

---

## Root folder

| File | What it is | Load how |
|---|---|---|
| `data_dictionary.md` | Column name glossary for every Excel/CSV file | Read manually before touching any file |
| `external_asset_register.xlsx` | Fixed assets maintained outside Exact Online, with depreciation | `sheet_name="Asset register"`. Also has a "Reconciliation" sheet comparing to GL accounts 105/265/555. Flag: `in_exact_register` (True/False) tells you which assets are already in Exact. |
| `2023_annual_summary_by_client.xlsx` | Prior-year benchmark per client | NOT loaded into FinancialDataset. Used for anomaly comparison only. |
| `intercompany_register.csv` | Intercompany transaction scenarios between parent and daughter | **Semicolon-delimited** — use `sep=";"` |
| `tax_payment_schedule.csv` | Scheduled VAT and tax payments with GL account codes | **Semicolon-delimited** — use `sep=";"` |

---

## `import_files_final/` — already imported into main administration

| File | What it is | Load how |
|---|---|---|
| `01_relations_debtors_creditors_import.xlsx` | Master debtor/creditor list — relation codes referenced by all other files | **Multi-sheet** — data is on `sheet_name="Invoerblad relaties"`. Other sheets are instructions/examples. |
| `05_bank_cash_entries_2024_import.xlsx` | All 2024 bank transactions (journal B00) | Proper headers: Datum, Bedrag, Naam, Omschrijving, Boekstuknummer |
| `05_bank_cash_entries_2025_import.xlsx` | All 2025 bank transactions (journal B00) | Same structure as 2024 — append both into `bank_entries` |
| `07_item_groups_optional_import.xlsx` | Product category master data | Optional — low priority |
| `08_items_optional_import.xlsx` | Full product catalogue | Large file — load last, low priority |

---

## `import_files_final/to do/` — NOT yet imported into main administration

The presence of this subfolder is itself a data quality signal. These files contain the most important financial data but have not been committed to Exact Online yet.

| File | What it is | Load how |
|---|---|---|
| `01_relations_debtors_creditors_import_daughter.xlsx` | Relation list for the daughter company | Compare record count to main `01_relations` file — difference is a readiness finding |
| `02_opening_balance_2024_01_01_import.xlsx` | Opening balances as of 01-01-2024, open AR, open AP | **Multi-sheet** — data is on `sheet_name="Invoerblad beginbalans en opens"`. First sheet is Dutch instructions. |
| `03_general_journal_entries_2024_2025_import.xlsx` | GL journal entries: payroll, depreciation, accruals, VAT memorials, corrections | Proper headers. Key fields: Boekdatum, Bedrag (signed), Grootboekrekening, Omschrijving, Boekstuknummer. This is the primary file for suspense and `to do` discrepancy checks. |
| `04_sales_entries_2024_2025_import.xlsx` | All sales invoices 2024–2025 (journal V1) | **No header row** — load with `header=None`. Positional: col3=invoice no, col5=date, col13=debtor ID, col15=GL account, col19=amount excl VAT, col21=VAT amount |
| `05_purchase_entries_2024_2025_import.xlsx` | All purchase invoices 2024–2025 (journal I1) | **No header row** — same positional structure as sales. col13=creditor ID |
| `06_bank_cash_entries_2024en2025_import - kopie.xlsx` | Copy of bank entries for both years combined | Compare totals to main bank files — difference is a readiness finding |

---

## `invoices/` — 723 PDFs total

| Folder | What it is | Usage |
|---|---|---|
| `invoices/sales/` | ~360 sales PDFs, named `sales_V240001_ClientName.pdf` | Do NOT load in bulk. Open on-demand only to verify specific flagged transactions. |
| `invoices/purchase/` | ~360 purchase PDFs, named `purchase_I240001_SupplierName.pdf` | Same — on-demand only. File name contains invoice number for lookup. |

---

## `fietsatelier_morgenwind_tax_statements_filed/`

| File | What it is | Usage |
|---|---|---|
| `VAT_returns_2024_filed.pdf` | Filed VAT return for 2024 | Extract total VAT amount with pdfplumber for VAT reconciliation check |
| `VAT_returns_2025_filed.pdf` | Filed VAT return for 2025 | Same |
| `CIT_final_statement_2024_filed.pdf` | Final corporate income tax statement 2024 | Extract taxable profit for CIT consistency check |
| `CIT_final_statement_2025_filed.pdf` | Final corporate income tax statement 2025 | Same |
| `CIT_provisional_statement_*.pdf` | Provisional CIT statements | Secondary reference only |
| `Wage_tax_statement_*.pdf` | Payroll tax statements | Lower priority |

---

## Dutch column name reference (confirmed from actual files)

| Dutch | English | Found in |
|---|---|---|
| `Boekdatum` | Booking date | GL entries |
| `Datum` | Date | Bank entries |
| `Bedrag` | Amount (signed float) | GL entries, bank entries |
| `Grootboekrekening` | GL account code | GL entries, bank entries |
| `Omschrijving` | Description | All files |
| `Boekstuknummer` | Document/batch ID | GL entries, bank entries |
| `Periode` | Fiscal period (1–12) | GL entries |
| `Boekjaar` | Fiscal year | GL entries |
| `Naam` | Counterparty name | Bank entries, relations |
| `Code` | Relation code | Bank entries, relations |
| `BTW-code` | VAT code | GL entries, sales, purchase |
| `BTW-bedrag` | VAT amount | GL entries, sales, purchase |

## Key account code ranges (Dutch chart of accounts)

| Range | Meaning |
|---|---|
| 0xxx | Fixed assets (CAPEX) |
| 1250 | Suspense / clearing ("Nog te duiden" = unidentified transactions) |
| 13xx | Accounts receivable |
| 17xx | Accounts payable |
| 1870 | VAT accounts |
| 4xxx | Operating expenses (OPEX, personnel) |
| 7xxx | Cost of goods / services |
| 8xxx | Revenue |
