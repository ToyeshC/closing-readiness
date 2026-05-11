# Data dictionary

## Import files

| File | Grain | Purpose |
|---|---|---|
| 01_relations_debtors_creditors_import.xlsx | One row per relation | Customer, supplier, contact, address, VAT, payment and bank defaults |
| 02_opening_balance_2024_01_01_import.xlsx | One row per balance or open item | 01-01-2024 opening balance, open AR, open AP |
| 03_sales_entries_2024_2025_import.xlsx | One row per imported sales invoice line, without template header row | Sales journal import using journal V1 |
| 04_purchase_entries_2024_2025_import.xlsx | One row per imported purchase invoice line, without template header row | Purchase journal import using journal I1 |
| 05_bank_cash_entries_2024_import.xlsx | One row per bank/cash mutation | 2024 bank import using journal B00 and valid GL offsets |
| 05_bank_cash_entries_2025_import.xlsx | One row per bank/cash mutation | 2025 bank import using journal B00 and valid GL offsets |
| 06_general_journal_entries_2024_2025_import.xlsx | One row per journal entry line | Payroll, depreciation, accruals, VAT memorials and corrections |
| 07_item_groups_optional_import.xlsx | One row per item group | Optional item group master data |
| 08_items_optional_import.xlsx | One row per item | Optional item master data |

## Core fields

- `Dagboek: Code`: Exact journal code validated against the uploaded journal list.
- `Boekjaar` and `Periode`: Fiscal year and month period.
- `Boekstuknummer`: Document identifier. It is stable within a document and used for grouping journal lines.
- `Code` and `Naam`: Relation code and name. Relation codes are generated in the relation master file and reused downstream.
- `Grootboekrekening`: GL account code validated against the uploaded chart of accounts.
- `BTW-code`, `BTW-percentage`, `BTW-bedrag`: VAT code, displayed percentage, and VAT amount. VAT codes are validated against the uploaded VAT list.
- `Onze ref.`, `Uw ref.`, `Betalingsreferentie`: Matching references used for reconciliation exercises.
