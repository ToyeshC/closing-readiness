from datetime import timedelta

from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date, _to_float, invoice_to_source_line

_MATCH_TOLERANCE = 0.01  # 1% tolerance for matching invoice to bank payment


def check(dataset: FinancialDataset) -> ReadinessCheck:
    period_end = dataset.period_end
    cutoff = period_end - timedelta(days=90)

    # Build a consumable pool of positive bank entry amounts for matching
    bank_pool: dict[int, list] = {}
    for r in dataset.bank_entries:
        amt = _to_float(r.get("bedrag"))
        if amt > 0:
            key = round(amt * 100)  # cents to avoid float key drift
            bank_pool.setdefault(key, []).append(r)

    def _matched(invoice_amount: float) -> bool:
        key = round(invoice_amount * 100)
        if bank_pool.get(key):
            bank_pool[key].pop(0)
            return True
        # Scan within 1% tolerance
        for bkey in list(bank_pool.keys()):
            if bank_pool[bkey] and abs(bkey - key) / max(key, 1) <= _MATCH_TOLERANCE:
                bank_pool[bkey].pop(0)
                return True
        return False

    overdue = []
    for r in dataset.sales_entries:
        d = _to_date(r.get("boekdatum"))
        # Invoice `bedrag` is ex-VAT; bank payments are gross. Match on gross
        # so the 1% tolerance doesn't get eaten by Dutch 21% VAT.
        amount = _to_float(r.get("bedrag")) + _to_float(r.get("btw_bedrag"))
        if amount <= 0:
            continue
        if dataset.period_start <= d < cutoff and not _matched(amount):
            overdue.append(r)

    total = sum(_to_float(r.get("bedrag")) + _to_float(r.get("btw_bedrag")) for r in overdue)

    if not overdue:
        return ReadinessCheck(
            check_id="ar_aging_stale",
            label="Accounts receivable aging",
            status="pass",
            severity="medium",
            description="No overdue AR older than 90 days found in the period.",
            affected_amount=None,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="ar_aging_stale",
        label="Accounts receivable aging",
        status="fail",
        severity="medium",
        description=(
            f"{len(overdue)} unpaid invoice(s) older than 90 days totalling "
            f"€{total:,.2f}. Review debtor collection."
        ),
        affected_amount=total,
        source_lines=[invoice_to_source_line("invoice_sales", r) for r in overdue[:50]],
    )
