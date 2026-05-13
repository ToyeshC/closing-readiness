"""Inspect actual field names returned by each Exact Online endpoint."""
from dotenv import load_dotenv
load_dotenv()

import asyncio, httpx, sqlite3

conn = sqlite3.connect("oauth_tokens.db")
conn.row_factory = sqlite3.Row
row = conn.execute("SELECT * FROM tokens WHERE id = 1").fetchone()
tok, div = row["access_token"], row["division_id"]


async def main():
    hdrs = {"Authorization": f"Bearer {tok}", "Accept": "application/json"}
    base = f"https://start.exactonline.nl/api/v1/{div}"

    checks = [
        ("salesinvoice/SalesInvoices", "$top=1"),
        ("purchaseentry/PurchaseEntries", "$top=1"),
        ("financialtransaction/BankEntries", "$top=1"),
        ("financialtransaction/CashEntries", "$top=1"),
        ("financialtransaction/TransactionLines", "$top=1"),
        ("openingbalance/CurrentYear/AfterEntry", "$top=1"),
        ("crm/Accounts", "$top=1"),
    ]

    async with httpx.AsyncClient(timeout=15) as c:
        for path, params in checks:
            r = await c.get(f"{base}/{path}?{params}", headers=hdrs)
            print(f"\n{r.status_code}  {path}")
            if r.status_code == 200:
                try:
                    d = r.json().get("d", {})
                    results = d.get("results", d) if isinstance(d, dict) else d
                    if isinstance(results, list) and results:
                        print(f"  fields: {sorted(results[0].keys())}")
                    elif not results:
                        print("  empty")
                except Exception as e:
                    print(f"  parse err: {e}")
            else:
                print(f"  body: {r.text[:200]}")


asyncio.run(main())
