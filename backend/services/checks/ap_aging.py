from datetime import timedelta

from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date, _to_float, invoice_to_source_line

_MATCH_TOLERANCE = 0.01  # 1%


def check(dataset: FinancialDataset) -> ReadinessCheck:
    period_end = dataset.period_end
    cutoff = period_end - timedelta(days=90)

    # Build a consumable pool of outgoing bank payments (negative bedrag = money leaving)
    bank_pool: dict[int, list] = {}
    for r in dataset.bank_entries:
        amt = _to_float(r.get("bedrag"))
        if amt < 0:
            key = round(abs(amt) * 100)
            bank_pool.setdefault(key, []).append(r)

    def _matched(purchase_amount: float) -> bool:
        key = round(purchase_amount * 100)
        if bank_pool.get(key):
            bank_pool[key].pop(0)
            return True
        for bkey in list(bank_pool.keys()):
            if bank_pool[bkey] and abs(bkey - key) / max(key, 1) <= _MATCH_TOLERANCE:
                bank_pool[bkey].pop(0)
                return True
        return False

    overdue = []
    for r in dataset.purchase_entries:
        d = _to_date(r.get("boekdatum"))
        # Invoice `bedrag` is ex-VAT; bank payments are gross. Match on gross.
        amount = _to_float(r.get("bedrag")) + _to_float(r.get("btw_bedrag"))
        if amount <= 0:
            continue
        if dataset.period_start <= d < cutoff and not _matched(amount):
            overdue.append(r)

    total = sum(_to_float(r.get("bedrag")) + _to_float(r.get("btw_bedrag")) for r in overdue)

    if not overdue:
        return ReadinessCheck(
            check_id="ap_aging_stale",
            label="Accounts payable aging",
            status="pass",
            severity="medium",
            description="No overdue payables older than 90 days found in the period.",
            affected_amount=None,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="ap_aging_stale",
        label="Accounts payable aging",
        status="fail",
        severity="medium",
        description=(
            f"{len(overdue)} unpaid supplier invoice(s) older than 90 days totalling "
            f"€{total:,.2f}. Risk of supplier reminders or late-payment fees."
        ),
        affected_amount=total,
        source_lines=[invoice_to_source_line("invoice_purchase", r) for r in overdue[:50]],
    )
