# Data dictionary

## Import files

| File | Grain | Purpose |
|---|---|---|
|File: Excel dataset name| Grain: the unit of observation| Purpose: What is this file for?|
| | | |
| 01_relations_debtors_creditors_import.xlsx | One row per relation | Customer, supplier, contact, address, VAT, payment and bank defaults |
| explained 01_relations_debtors_creditors_import.xlsx | One row per relation: Each row represents one customer OR one supplier. This is master/reference data. | Contains: customer names, supplier names, contact info, addresses, VAT numbers, bank accounts, payment terms ... This file is basically: the company address book |
| | | |
| 02_opening_balance_2024_01_01_import.xlsx | One row per balance or open item | 01-01-2024 opening balance, open AR, open AP |
| explained 02_opening_balance_2024_01_01_import.xlsx | One row per balance or open item: A such, the rows are NOT transactions. They are starting balances, unpaid invoices, unresolved AP/AR items at:01-01-2024 | 01-01-2024 opening balance, open AR, open AP. This is the bridge between: prior year → current year |
| | | |
| 03_sales_entries_2024_2025_import.xlsx | One row per imported sales invoice line, without template header row | Sales journal import using journal V1 |
| explained 03_sales_entries_2024_2025_import.xlsx | One row per imported sales invoice LINE, without template header row. So one invoice may appear across multiple rows. Example: V240001 Bike repair, V240001 VAT, V240001 Parts | Sales journal import using journal V1 (where V is from "verkoop" - sales) |
| | | |
| 04_purchase_entries_2024_2025_import.xlsx | One row per imported purchase invoice line, without template header row | Purchase journal import using journal I1 |
| explained 04_purchase_entries_2024_2025_import.xlsx | One row per imported purchase invoice line, without template header row. AS SUCH, multiple rows can belong to one purchase invoice. | Purchase journal import using journal I1 (where I is from "inkoop" - purchase). This is LIKELY: supplier expenses, AP flows, inventory purchases, CAPEX candidates. |
| | | |
| 05_bank_cash_entries_2024_import.xlsx | One row per bank/cash mutation | 2024 bank import using journal B00 and valid GL offsets |
| 05_bank_cash_entries_2025_import.xlsx | One row per bank/cash mutation | 2025 bank import using journal B00 and valid GL offsets |
| explained 05_bank_cash_entries_2024/2025_import.xlsx | One row per bank/cash mutation. Mutation = movement/change. Each row is: one bank transaction, or one payment, or one receipt. | for year 2024/2025 bank import using journal B00 (where B is for bankboeking - bank) and valid GL offsets. This is actual cash movement! |
| | | |
| 06_general_journal_entries_2024_2025_import.xlsx | One row per journal entry line | Payroll, depreciation, accruals, VAT memorials and corrections |
| explained 06_general_journal_entries_2024_2025_import.xlsx | One row per journal ENTRY LINE. Aka, A single journal can span multiple rows. | Purpose: it contains: Payroll, depreciation, accruals, VAT memorials and corrections. AKA... The accountant-controlled layer. The memoriaalboeking is the manual general journal entry... So: VAT memorials means manually booked VAT adjustments. |
| | | |
| 07_item_groups_optional_import.xlsx | One row per item group | Optional item group master data |
| explained 07_item_groups_optional_import.xlsx | One row per item GROUP. contains categories of products/services. Examples: workshop labor. | Optional item GROUP master data |
| | | |
| 08_items_optional_import.xlsx | One row per item | Optional item master data |
| explained 08_items_optional_import.xlsx | One row per item. Actual products/services. | Optional item master data |
| | | |

## Core fields

- `Dagboek: Code`: Exact journal code validated against the uploaded journal list.
  - journal (dagboek) code
  - Code: V1	Meaning: Sales journal
  - Code: I1	Meaning: Purchase journal
  - Code: B00	Meaning: Bank journal
- `Boekjaar` and `Periode`: Fiscal year and month period.
  - For the `Periods` usually: 1 means January and 12 means December
  - For the `Boekjaar` usually: 24 means 2024 and 25 means 2025
- `Boekstuknummer`: Document identifier. It is stable within a document and used for grouping journal lines.
  - the transaction grouping key
  - Because data is: line-level, You need a way to reconstruct: invoices, journals, postings, can use `Boekstuknummer`
  - Example:
    - Boekstuknummer: V240001 | GL: Revenue | Amount: +100
    - Boekstuknummer: V240001 | GL: VAT | Amount: +21
    - Boekstuknummer: V240001 | GL: AR | Amount: -121
    - All grouped by Boekstuknummer
- `Code` and `Naam`: Relation code and name. Relation codes are generated in the relation master file and reused downstream.
  - `Code`: relation code
  - `Naam`: relation name?
- `Grootboekrekening`: GL account code validated against the uploaded chart of accounts.
  - `Grootboekrekening` = GL account code = General ledger account code
- `BTW-code`, `BTW-percentage`, `BTW-bedrag`: VAT code, VAT displayed percentage, and VAT amount. VAT codes are validated against the uploaded VAT list.
  - VAT reconciliation checks... You can verify: Does VAT amount = taxable base × VAT rate? Efficient automated check.
- `Onze ref.`, `Uw ref.`, `Betalingsreferentie`: Matching references used for reconciliation exercises.
  - `Onze ref.` = Our reference
  - `Uw ref.` = Your reference 
  - `Betalingsreferentie` = Payment reference
  - reconciliation anchors
