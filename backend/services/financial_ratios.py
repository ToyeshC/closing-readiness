from backend.models import FinancialDataset, FinancialRatios, RatioResult
from backend.services.normalizer import _to_date, _to_float

_MATCH_TOLERANCE = 0.01  # same as ar/ap aging checks


def _open_invoices(
    invoices: list[dict],
    bank_entries: list[dict],
    positive_flow: bool,
    period_start,
    period_end,
) -> float:
    """
    Returns total value of unmatched invoices dated within [period_start, period_end].
    positive_flow=True for sales (incoming bank entries), False for purchases (outgoing).
    """
    bank_pool: dict[int, list] = {}
    for r in bank_entries:
        amt = _to_float(r.get("bedrag"))
        if positive_flow and amt > 0:
            key = round(amt * 100)
            bank_pool.setdefault(key, []).append(r)
        elif not positive_flow and amt < 0:
            key = round(abs(amt) * 100)
            bank_pool.setdefault(key, []).append(r)

    def _matched(amount: float) -> bool:
        key = round(amount * 100)
        if bank_pool.get(key):
            bank_pool[key].pop(0)
            return True
        for bkey in list(bank_pool.keys()):
            if bank_pool[bkey] and abs(bkey - key) / max(key, 1) <= _MATCH_TOLERANCE:
                bank_pool[bkey].pop(0)
                return True
        return False

    total = 0.0
    for r in invoices:
        d = _to_date(r.get("boekdatum"))
        amount = _to_float(r.get("bedrag"))
        if amount <= 0:
            continue
        if not (period_start <= d <= period_end):
            continue
        if not _matched(amount):
            total += amount
    return total


def compute_ratios(dataset: FinancialDataset) -> FinancialRatios:
    period_days = max((dataset.period_end - dataset.period_start).days, 1)

    # Revenue: sum positive bedrag from sales_entries within period
    revenue = sum(
        _to_float(e.get("bedrag"))
        for e in dataset.sales_entries
        if _to_float(e.get("bedrag")) > 0
        and dataset.period_start <= _to_date(e.get("boekdatum")) <= dataset.period_end
    )

    # Purchases: sum positive bedrag from purchase_entries within period
    purchases = sum(
        _to_float(e.get("bedrag"))
        for e in dataset.purchase_entries
        if _to_float(e.get("bedrag")) > 0
        and dataset.period_start <= _to_date(e.get("boekdatum")) <= dataset.period_end
    )

    # Open AR: unmatched sales invoices within period (all ages, not just >90 days)
    open_ar = _open_invoices(
        dataset.sales_entries, dataset.bank_entries,
        positive_flow=True, period_start=dataset.period_start, period_end=dataset.period_end,
    )

    # Open AP: unmatched purchase invoices within period
    open_ap = _open_invoices(
        dataset.purchase_entries, dataset.bank_entries,
        positive_flow=False, period_start=dataset.period_start, period_end=dataset.period_end,
    )

    # DSO = (open AR / revenue) * period_days
    if revenue > 0 and open_ar > 0:
        dso = open_ar / revenue * period_days
        dso_reliable = True
        dso_note = None
    else:
        dso = None
        dso_reliable = False
        dso_note = "Revenue from GL is €0 — GL entries not yet imported. DSO computed from sales entry file only; verify after revenue reconciliation passes."

    # DPO = (open AP / purchases) * period_days
    if purchases > 0 and open_ap > 0:
        dpo = open_ap / purchases * period_days
        dpo_reliable = True
        dpo_note = None
    else:
        dpo = None
        dpo_reliable = False
        dpo_note = "Insufficient purchase or bank data to compute DPO reliably."

    working_capital = open_ar - open_ap

    return FinancialRatios(
        dso_days=RatioResult(
            value=round(dso, 1) if dso is not None else None,
            reliable=dso_reliable,
            note=dso_note,
        ),
        dpo_days=RatioResult(
            value=round(dpo, 1) if dpo is not None else None,
            reliable=dpo_reliable,
            note=dpo_note,
        ),
        working_capital=RatioResult(
            value=round(working_capital, 2),
            reliable=True,
            note=None,
        ),
        revenue_period=RatioResult(
            value=round(revenue, 2),
            reliable=revenue > 0,
            note=None if revenue > 0 else "No sales entries found in period.",
        ),
        purchases_period=RatioResult(
            value=round(purchases, 2),
            reliable=purchases > 0,
            note=None if purchases > 0 else "No purchase entries found in period.",
        ),
        open_ar=RatioResult(
            value=round(open_ar, 2),
            reliable=True,
            note=None,
        ),
        open_ap=RatioResult(
            value=round(open_ap, 2),
            reliable=True,
            note=None,
        ),
    )
