"""Engine smoke test on Exact Online live data. Run after authenticating via test_server.

Usage:
  python3 engine_test.py                          # defaults to last complete calendar year
  python3 engine_test.py --start 2024-01-01 --end 2024-12-31
"""
from dotenv import load_dotenv
load_dotenv()

import argparse
import asyncio
from datetime import date
from backend.services.token_store import get_access_token, get_division_id
from backend.services.data_loader import load_all_from_exact
from backend.services.readiness_engine import ReadinessEngine


def _default_period() -> tuple[date, date]:
    last_year = date.today().year - 1
    return date(last_year, 1, 1), date(last_year, 12, 31)


async def main(start: date, end: date):
    tok = await get_access_token()
    div = get_division_id()
    print(f"Division: {div} | token: {tok[:20]}... | period: {start} → {end}")

    ds = await load_all_from_exact(tok, div, start, end)
    print(f"\nData loaded:")
    print(f"  GL entries:       {len(ds.gl_entries)}")
    print(f"  Sales entries:    {len(ds.sales_entries)}")
    print(f"  Purchase entries: {len(ds.purchase_entries)}")
    print(f"  Bank entries:     {len(ds.bank_entries)}")
    print(f"  Opening balances: {len(ds.opening_balances)}")

    ob_accounts = sorted(set(str(r.get("grootboekrekening", "")) for r in ds.opening_balances))
    inventory = [a for a in ob_accounts if a.startswith("16")]
    print(f"\nOpening balance accounts: {ob_accounts}")
    print(f"Inventory accounts (16xx): {inventory}")

    report = ReadinessEngine(ds).run()
    print(f"\nScore: {report.overall_score:.0%} | Advice ready: {report.advice_ready}")
    for c in report.checks:
        if c.score_after_fix:
            extra = f" -> fix: {c.score_after_fix:.0%}"
        elif c.severity == "blocker" and c.status != "pass":
            extra = " -> unlocks advisory"
        else:
            extra = ""
        print(f"  [{c.status.upper():7}] {c.check_id}{extra}")

    r = report.ratios
    print(f"\nRatios:")
    print(f"  DSO:             {r.dso_days.value} days (reliable={r.dso_days.reliable})")
    print(f"  DPO:             {r.dpo_days.value} days (reliable={r.dpo_days.reliable})")
    print(f"  Working capital: {r.working_capital.value}")
    print(f"  Revenue:         {r.revenue_period.value} (reliable={r.revenue_period.reliable})")
    print(f"  Gross margin:    {r.gross_profit_margin.value} (reliable={r.gross_profit_margin.reliable})")
    if r.gross_profit_margin.note:
        print(f"  Gross margin note: {r.gross_profit_margin.note}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    default_start, default_end = _default_period()
    parser.add_argument("--start", type=date.fromisoformat, default=default_start)
    parser.add_argument("--end",   type=date.fromisoformat, default=default_end)
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end))
