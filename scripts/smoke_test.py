"""Engine smoke test on local data files.

Usage:
  python3 scripts/smoke_test.py                          # defaults to last complete calendar year
  python3 scripts/smoke_test.py --start 2024-01-01 --end 2024-12-31
"""
import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.services.data_loader import load_all
from backend.services.readiness_engine import ReadinessEngine


def _default_period() -> tuple[date, date]:
    last_year = date.today().year - 1
    return date(last_year, 1, 1), date(last_year, 12, 31)


async def main(start: date, end: date):
    ds = await load_all(Path("00 Dataroom hackathon"), start, end)
    report = ReadinessEngine(ds).run()

    print(f"\nScore: {report.overall_score:.0%}  |  Advice ready: {report.advice_ready}  |  Period: {start} → {end}\n")
    for c in report.checks:
        amt = f"€{c.affected_amount:,.2f}" if c.affected_amount is not None else "-"
        lines = len(c.source_lines)
        print(f"  [{c.status.upper():7}]  {c.label:<35}  amount={amt}  lines={lines}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    default_start, default_end = _default_period()
    parser.add_argument("--start", type=date.fromisoformat, default=default_start)
    parser.add_argument("--end",   type=date.fromisoformat, default=default_end)
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end))
