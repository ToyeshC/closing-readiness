from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date, gl_to_source_line


def check(dataset: FinancialDataset) -> ReadinessCheck:
    period_start = dataset.period_start
    period_end = dataset.period_end

    revenue_gl = [
        r for r in dataset.gl_entries
        if str(r.get("grootboekrekening") or "").startswith("8")
        and period_start <= _to_date(r.get("boekdatum")) <= period_end
    ]
    # Revenue in Dutch GL is stored as credit (negative bedrag); use abs for comparison
    gl_total = abs(sum(float(r.get("bedrag") or 0) for r in revenue_gl))
    sales_total = abs(sum(
        float(r.get("bedrag") or 0) for r in dataset.sales_entries
        if period_start <= _to_date(r.get("boekdatum")) <= period_end
    ))

    if abs(gl_total) < 1.0 and abs(sales_total) < 1.0:
        return ReadinessCheck(
            check_id="revenue_reconciliation",
            label="Revenue reconciliation",
            status="warn",
            severity="medium",
            description="No revenue found in GL (8xxx) or sales entries — check data loading.",
            affected_amount=None,
            source_lines=[],
        )

    delta = abs(gl_total - sales_total)
    delta_pct = delta / max(abs(gl_total), abs(sales_total), 1.0)

    if delta_pct > 0.01:
        return ReadinessCheck(
            check_id="revenue_reconciliation",
            label="Revenue reconciliation",
            status="fail",
            severity="high",
            description=(
                f"GL revenue (€{gl_total:,.2f}) differs from sales entries total (€{sales_total:,.2f}) "
                f"by {delta_pct:.1%} (€{delta:,.2f}). Investigate before closing."
            ),
            affected_amount=delta,
            source_lines=[gl_to_source_line(r) for r in revenue_gl[:50]],
        )

    if delta_pct > 0.001:
        return ReadinessCheck(
            check_id="revenue_reconciliation",
            label="Revenue reconciliation",
            status="warn",
            severity="medium",
            description=(
                f"Minor GL revenue vs sales discrepancy of {delta_pct:.2%} (€{delta:,.2f}). "
                "May be timing differences or rounding."
            ),
            affected_amount=delta,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="revenue_reconciliation",
        label="Revenue reconciliation",
        status="pass",
        severity="high",
        description=f"GL revenue (€{gl_total:,.2f}) reconciles with sales entries. Delta < 0.1%.",
        affected_amount=None,
        source_lines=[],
    )
