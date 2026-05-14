import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.services.data_loader import load_all
from backend.services.readiness_engine import ReadinessEngine


async def main():
    ds = await load_all(Path("00 Dataroom hackathon"), date(2024, 1, 1), date(2024, 12, 31))
    report = ReadinessEngine(ds).run()

    print(f"\nScore: {report.overall_score:.0%}  |  Advice ready: {report.advice_ready}\n")
    for c in report.checks:
        amt = f"€{c.affected_amount:,.2f}" if c.affected_amount is not None else "-"
        lines = len(c.source_lines)
        print(f"  [{c.status.upper():7}]  {c.label:<35}  amount={amt}  lines={lines}")
    print()


asyncio.run(main())
