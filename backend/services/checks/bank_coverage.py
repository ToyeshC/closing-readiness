import pandas as pd

from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date


def check(dataset: FinancialDataset) -> ReadinessCheck:
    period_start = dataset.period_start
    period_end = dataset.period_end

    bdays = pd.bdate_range(start=period_start, end=period_end)
    total_bdays = len(bdays)

    if total_bdays == 0:
        return ReadinessCheck(
            check_id="bank_statement_coverage",
            label="Bank statement coverage",
            status="warn",
            severity="medium",
            description="Could not compute business days for the given period.",
            affected_amount=None,
            source_lines=[],
        )

    bday_set = {d.date() for d in bdays}
    bank_dates = {
        _to_date(r.get("datum"))
        for r in dataset.bank_entries
        if r.get("datum") is not None
        and period_start <= _to_date(r.get("datum")) <= period_end
    }
    # Weekend/holiday entries (interest accruals etc.) inflate the numerator
    # without raising the business-day denominator. Intersect with the
    # bday set so coverage measures real working-day presence.
    bank_dates &= bday_set

    coverage = len(bank_dates) / total_bdays

    if coverage < 0.80:
        status = "fail"
        desc = (
            f"Bank statements cover only {coverage:.0%} of business days "
            f"({len(bank_dates)} of {total_bdays} days). Significant gaps present."
        )
    elif coverage < 0.90:
        status = "warn"
        desc = (
            f"Bank statements cover {coverage:.0%} of business days "
            f"({len(bank_dates)} of {total_bdays} days). Some gaps present."
        )
    else:
        status = "pass"
        desc = (
            f"Bank statements cover {coverage:.0%} of business days "
            f"({len(bank_dates)} of {total_bdays} days)."
        )

    return ReadinessCheck(
        check_id="bank_statement_coverage",
        label="Bank statement coverage",
        status=status,
        severity="medium",
        description=desc,
        affected_amount=None,
        source_lines=[],
    )
