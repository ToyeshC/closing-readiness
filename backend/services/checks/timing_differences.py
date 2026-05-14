from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date, _to_float, gl_to_source_line


def check(dataset: FinancialDataset) -> ReadinessCheck:
    flagged = []
    for r in dataset.gl_entries:
        periode = r.get("periode")
        boekdatum = r.get("boekdatum")
        if periode is None or boekdatum is None:
            continue
        try:
            period_month = int(float(str(periode)))
            booking_month = _to_date(boekdatum).month
        except (ValueError, TypeError):
            continue
        if 1 <= period_month <= 12 and period_month != booking_month:
            flagged.append(r)

    total = sum(abs(_to_float(r.get("bedrag"))) for r in flagged)

    if not flagged:
        return ReadinessCheck(
            check_id="timing_differences",
            label="Timing differences",
            status="pass",
            severity="medium",
            description="All GL entries are posted in their designated accounting period.",
            affected_amount=None,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="timing_differences",
        label="Timing differences",
        status="warn",
        severity="medium",
        description=(
            f"{len(flagged)} GL entry/entries posted in a different month than their "
            f"accounting period (Periode field). Total: €{total:,.2f}. "
            "May indicate period-cutoff errors — review before closing."
        ),
        affected_amount=total,
        source_lines=[gl_to_source_line(r) for r in flagged[:50]],
    )
