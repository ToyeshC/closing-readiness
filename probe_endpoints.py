"""One-shot endpoint probe. Run: python3 probe_endpoints.py"""
from dotenv import load_dotenv
load_dotenv()

import asyncio, httpx, sqlite3, time

conn = sqlite3.connect("oauth_tokens.db")
conn.row_factory = sqlite3.Row
row = conn.execute("SELECT * FROM tokens WHERE id = 1").fetchone()
assert row and row["expires_at"] - time.time() > 10, "Token expired — re-authenticate"

tok = row["access_token"]
div = row["division_id"]

CANDIDATES = [
    # GL / transaction lines
    ("financial/TransactionLines", "$top=1"),
    ("financials/TransactionLines", "$top=1"),
    ("financial/GeneralJournalEntries", "$top=1"),
    ("financial/GeneralJournalEntryLines", "$top=1"),
    ("bulk/Financial/TransactionLines", "$top=1&$select=AmountDC"),
    # Sales / purchase
    ("salesinvoice/SalesInvoices", "$top=1"),
    ("purchaseentry/PurchaseEntries", "$top=1"),
    # Bank / cash
    ("cashflow/CashFlowStatements", "$top=1"),
    ("financial/Journals", "$top=1"),
    # Opening balance / assets
    ("assets/Assets", "$top=1"),
    ("financial/OpeningBalances", "$top=1"),
    ("financial/OpeningBalanceCurrentYears", "$top=1"),
    # Relations
    ("crm/Accounts", "$top=1"),
]


async def main():
    hdrs = {"Authorization": f"Bearer {tok}", "Accept": "application/json"}
    base = f"https://start.exactonline.nl/api/v1/{div}"
    async with httpx.AsyncClient(timeout=15) as client:
        for path, params in CANDIDATES:
            r = await client.get(f"{base}/{path}?{params}", headers=hdrs)
            extra = ""
            if r.status_code == 200:
                try:
                    d = r.json().get("d", {})
                    results = d.get("results", d) if isinstance(d, dict) else d
                    if isinstance(results, list) and results:
                        extra = f"  -> keys: {list(results[0].keys())[:6]}"
                    elif isinstance(results, dict) and results:
                        extra = f"  -> keys: {list(results.keys())[:6]}"
                    else:
                        extra = "  -> empty"
                except Exception as e:
                    extra = f"  parse err: {e}"
            print(f"  {r.status_code}  {path}{extra}")

asyncio.run(main())
