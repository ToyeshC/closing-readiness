import logging
from pathlib import Path
from datetime import date

import httpx
import pandas as pd

from backend.models import FinancialDataset

logger = logging.getLogger(__name__)

# Positional column map for sales and purchase entry files (no header row).
# Confirmed from actual file inspection.
_INVOICE_COLUMNS = {
    0: "dagboek_code",
    1: "boekjaar",
    2: "periode",
    3: "boekstuknummer",
    4: "omschrijving",
    5: "boekdatum",
    6: "vervaldatum",
    7: "valuta",
    8: "regelnummer",
    9: "btw_code",
    10: "onze_ref",
    11: "uw_ref",
    12: "regel_ref",
    13: "code",        # relation code — debtor (sales) or creditor (purchase)
    14: "naam",        # relation name
    15: "grootboekrekening",
    16: "regel_omschrijving",
    17: "aantal",
    18: "btw_percentage",
    19: "bedrag",      # amount excl. VAT
    20: "regel_ref2",
    21: "btw_bedrag",  # VAT amount
    22: "opmerkingen",
}


def _records_with_none(df: pd.DataFrame) -> list[dict]:
    # pd.DataFrame.where(notna, None) leaves NaN in numeric columns because pandas
    # coerces None back to NaN during dtype-preserving substitution. Do the
    # substitution after to_dict() so the result has real Python None.
    return [
        {k: (None if (v is None or (isinstance(v, float) and pd.isna(v))) else v) for k, v in row.items()}
        for row in df.to_dict(orient="records")
    ]


def _load_excel(path: Path, **kwargs) -> list[dict]:
    """Load an Excel file with standard headers. Returns empty list on any error."""
    try:
        df = pd.read_excel(path, **kwargs)
        df.columns = [
            str(c).strip().lower()
            .replace(" ", "_").replace(":", "").replace(".", "_").replace("-", "_")
            .strip("_")
            for c in df.columns
        ]
        return _records_with_none(df)
    except Exception as e:
        logger.warning("Failed to load %s: %s", path.name, e)
        return []


def _load_excel_positional(path: Path, col_map: dict[int, str]) -> list[dict]:
    """Load a headerless Excel file using positional column names."""
    try:
        df = pd.read_excel(path, header=None)
        rename = {i: col_map.get(i, f"col_{i}") for i in range(len(df.columns))}
        df = df.rename(columns=rename)
        return _records_with_none(df)
    except Exception as e:
        logger.warning("Failed to load %s: %s", path.name, e)
        return []


def _load_csv(path: Path, sep: str = ";") -> list[dict]:
    """Load a semicolon-delimited CSV file."""
    try:
        df = pd.read_csv(path, sep=sep)
        df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
        return _records_with_none(df)
    except Exception as e:
        logger.warning("Failed to load %s: %s", path.name, e)
        return []



async def load_all(data_folder: Path, period_start: date, period_end: date) -> FinancialDataset:
    root = data_folder
    main_folder = root / "import_files_final"
    todo_folder = main_folder / "to do"

    # GL entries — only in to do/, proper column headers
    gl_entries = _load_excel(todo_folder / "03_general_journal_entries_2024_2025_import.xlsx")

    # Sales entries — only in to do/, no header row (positional)
    sales_entries = _load_excel_positional(
        todo_folder / "04_sales_entries_2024_2025_import.xlsx",
        col_map=_INVOICE_COLUMNS,
    )

    # Purchase entries — only in to do/, no header row (positional, same structure)
    purchase_entries = _load_excel_positional(
        todo_folder / "05_purchase_entries_2024_2025_import.xlsx",
        col_map=_INVOICE_COLUMNS,
    )

    # Bank entries — 2024 and 2025 are the main versions; append both
    bank_2024 = _load_excel(main_folder / "05_bank_cash_entries_2024_import.xlsx")
    bank_2025 = _load_excel(main_folder / "05_bank_cash_entries_2025_import.xlsx")
    bank_entries = bank_2024 + bank_2025

    # Relations — row 0 is section labels, row 1 is the real header
    relations = _load_excel(
        main_folder / "01_relations_debtors_creditors_import.xlsx",
        sheet_name="Invoerblad relaties",
        header=1,
    )

    # Opening balances — row 0 is section labels, row 1 is the real header
    opening_balances = _load_excel(
        todo_folder / "02_opening_balance_2024_01_01_import.xlsx",
        sheet_name="Invoerblad beginbalans en opens",
        header=1,
    )

    # Asset register — external, maintained outside Exact Online
    asset_register = _load_excel(root / "external_asset_register.xlsx", sheet_name="Asset register")

    # Intercompany and tax schedule — semicolon-delimited CSVs
    intercompany = _load_csv(root / "intercompany_register.csv")
    tax_schedule = _load_csv(root / "tax_payment_schedule.csv")

    # Items (optional, low priority)
    item_groups = _load_excel(main_folder / "07_item_groups_optional_import.xlsx")
    items = _load_excel(main_folder / "08_items_optional_import.xlsx")

    return FinancialDataset(
        period_start=period_start,
        period_end=period_end,
        gl_entries=gl_entries,
        opening_balances=opening_balances,
        sales_entries=sales_entries,
        purchase_entries=purchase_entries,
        bank_entries=bank_entries,
        relations=relations,
        asset_register=asset_register,
        intercompany=intercompany,
        tax_schedule=tax_schedule,
        items=items,
        item_groups=item_groups,
    )


# ---------------------------------------------------------------------------
# Exact Online API loader
# ---------------------------------------------------------------------------

_EXACT_BASE = "https://start.exactonline.nl/api/v1"


def _exact_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}


async def _exact_get_all(client: httpx.AsyncClient, url: str, headers: dict) -> list[dict]:
    """Fetch all pages from an Exact Online OData endpoint (follows @odata.nextLink)."""
    results: list[dict] = []
    next_url: str | None = url
    while next_url:
        resp = await client.get(next_url, headers=headers, timeout=30.0)
        resp.raise_for_status()
        body = resp.json()
        results.extend(body.get("d", {}).get("results", []))
        next_url = body.get("d", {}).get("__next")
    return results


async def _exact_get_safe(
    client: httpx.AsyncClient, url: str, headers: dict, name: str = ""
) -> list[dict]:
    """Like _exact_get_all but returns [] on HTTP errors instead of raising."""
    try:
        return await _exact_get_all(client, url, headers)
    except Exception as e:
        logger.warning("Exact Online %s skipped: %s", name or url.split("?")[0].split("/")[-1], e)
        return []


async def load_all_from_exact(
    access_token: str,
    division_id: int,
    period_start: date,
    period_end: date,
) -> FinancialDataset:
    """
    Load FinancialDataset from Exact Online REST API.

    Field mapping (Exact Online JSON → Dutch column names all checks expect):
      TransactionLines.Date            → boekdatum
      TransactionLines.AmountDC        → bedrag
      TransactionLines.GLAccountCode   → grootboekrekening
      TransactionLines.Description     → omschrijving
      TransactionLines.EntryNumber     → boekstuknummer
      TransactionLines.FinancialPeriod → periode
      PurchaseEntries.EntryDate        → boekdatum
      PurchaseEntries.AmountDC         → bedrag
      PurchaseEntries.SupplierName     → naam  (no SupplierCode in API)
      BankEntryLines.Date              → datum
      BankEntryLines.AmountDC          → bedrag
      OpeningBalance.Amount+BalanceSide → bedrag (debit positive, credit negative)
    """
    base = f"{_EXACT_BASE}/{division_id}"
    hdrs = _exact_headers(access_token)
    d_filter = (
        f"Date ge datetime'{period_start.isoformat()}T00:00:00'"
        f" and Date le datetime'{period_end.isoformat()}T23:59:59'"
    )

    async with httpx.AsyncClient() as client:
        # GL entries — all transaction lines in period
        gl_raw = await _exact_get_all(
            client,
            f"{base}/financialtransaction/TransactionLines"
            f"?$filter={d_filter}"
            "&$select=EntryNumber,Date,AmountDC,GLAccountCode,Description,FinancialPeriod",
            hdrs,
        )
        gl_entries = [
            {
                "boekstuknummer": r.get("EntryNumber"),
                "boekdatum": r.get("Date"),
                "bedrag": r.get("AmountDC"),
                "grootboekrekening": r.get("GLAccountCode"),
                "omschrijving": r.get("Description"),
                "periode": r.get("FinancialPeriod"),
            }
            for r in gl_raw
        ]

        # Sales entries — SalesInvoices is empty when data is imported as GL entries.
        # Fall back to TransactionLines on account 1300 (AR/debtors) as sales proxy.
        sales_raw = await _exact_get_safe(
            client,
            f"{base}/salesinvoice/SalesInvoices"
            f"?$filter=InvoiceDate ge datetime'{period_start.isoformat()}T00:00:00'"
            f" and InvoiceDate le datetime'{period_end.isoformat()}T23:59:59'"
            "&$select=EntryNumber,InvoiceDate,AmountDC,DebtorCode,DebtorName,Description,DueDate,YourRef",
            hdrs, "SalesInvoices",
        )
        if sales_raw:
            sales_entries = [
                {
                    "boekstuknummer": r.get("EntryNumber"),
                    "boekdatum": r.get("InvoiceDate"),
                    "bedrag": r.get("AmountDC"),
                    "code": r.get("DebtorCode"),
                    "naam": r.get("DebtorName"),
                    "omschrijving": r.get("Description"),
                    "vervaldatum": r.get("DueDate"),
                    "uw_ref": r.get("YourRef"),
                    "grootboekrekening": "1300",
                }
                for r in sales_raw
            ]
        else:
            # Fallback: AR lines from GL — no due date available
            ar_lines = [e for e in gl_entries if str(e.get("grootboekrekening", "")).startswith("13")]
            sales_entries = [
                {**e, "vervaldatum": None, "code": None, "naam": None, "uw_ref": None}
                for e in ar_lines
            ]

        # Purchase entries — SupplierCode field does not exist in API; use SupplierName only
        purch_raw = await _exact_get_safe(
            client,
            f"{base}/purchaseentry/PurchaseEntries"
            f"?$filter=EntryDate ge datetime'{period_start.isoformat()}T00:00:00'"
            f" and EntryDate le datetime'{period_end.isoformat()}T23:59:59'"
            "&$select=EntryNumber,EntryDate,AmountDC,SupplierName,Description,DueDate,YourRef",
            hdrs, "PurchaseEntries",
        )
        purchase_entries = [
            {
                "boekstuknummer": r.get("EntryNumber"),
                "boekdatum": r.get("EntryDate"),
                "bedrag": r.get("AmountDC"),
                "code": None,
                "naam": r.get("SupplierName"),
                "omschrijving": r.get("Description"),
                "vervaldatum": r.get("DueDate"),
                "uw_ref": r.get("YourRef"),
                "grootboekrekening": "1700",
            }
            for r in purch_raw
        ]

        # Bank entries — BankEntryLines has Date+AmountDC; BankEntries header does not
        bank_lines_raw = await _exact_get_safe(
            client,
            f"{base}/financialtransaction/BankEntryLines"
            f"?$filter={d_filter}"
            "&$select=EntryNumber,Date,AmountDC,AccountName,Description",
            hdrs, "BankEntryLines",
        )
        cash_lines_raw = await _exact_get_safe(
            client,
            f"{base}/financialtransaction/CashEntryLines"
            f"?$filter={d_filter}"
            "&$select=EntryNumber,Date,AmountDC,AccountName,Description",
            hdrs, "CashEntryLines",
        )
        bank_entries = [
            {
                "datum": r.get("Date"),
                "bedrag": r.get("AmountDC"),
                "naam": r.get("AccountName"),
                "omschrijving": r.get("Description"),
                "boekstuknummer": r.get("EntryNumber"),
            }
            for r in bank_lines_raw + cash_lines_raw
        ]

        # Opening balances — Amount is signed per BalanceSide (D=debit positive, C=credit negative)
        opening_raw = await _exact_get_safe(
            client,
            f"{base}/openingbalance/CurrentYear/AfterEntry"
            "?$select=GLAccountCode,GLAccountDescription,Amount,BalanceSide",
            hdrs, "OpeningBalance",
        )
        opening_balances = [
            {
                "grootboekrekening": r.get("GLAccountCode"),
                "bedrag": (r.get("Amount") or 0) * (1 if r.get("BalanceSide") == "D" else -1),
                "omschrijving": r.get("GLAccountDescription"),
            }
            for r in opening_raw
        ]

        # Relations
        relations_raw = await _exact_get_safe(
            client,
            f"{base}/crm/Accounts"
            "?$select=Code,Name,AccountManagerFullName,Email",
            hdrs, "Accounts",
        )
        relations = [
            {
                "code": r.get("Code"),
                "naam": r.get("Name"),
                "account_manager": r.get("AccountManagerFullName"),
                "email": r.get("Email"),
            }
            for r in relations_raw
        ]

    # asset_register, intercompany, tax_schedule have no Exact Online equivalent.
    return FinancialDataset(
        period_start=period_start,
        period_end=period_end,
        gl_entries=gl_entries,
        opening_balances=opening_balances,
        sales_entries=sales_entries,
        purchase_entries=purchase_entries,
        bank_entries=bank_entries,
        relations=relations,
        asset_register=[],
        intercompany=[],
        tax_schedule=[],
        items=[],
        item_groups=[],
    )
