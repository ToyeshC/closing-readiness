from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import gl_to_source_line

_CAPEX_KEYWORDS = [
    "machine", "fiets", "fietsen", "inventaris", "auto", "voertuig",
    "apparaat", "installatie", "computer", "laptop", "printer",
]
_AMOUNT_THRESHOLD = 1000.0


def check(dataset: FinancialDataset) -> ReadinessCheck:
    flagged = []
    for r in dataset.gl_entries:
        account = str(r.get("grootboekrekening") or "")
        if not account.startswith("4"):
            continue
        amount = abs(float(r.get("bedrag") or 0))
        if amount < _AMOUNT_THRESHOLD:
            continue
        desc = str(r.get("omschrijving") or "").lower()
        if any(kw in desc for kw in _CAPEX_KEYWORDS):
            flagged.append(r)

    total = sum(abs(float(r.get("bedrag") or 0)) for r in flagged)

    if not flagged:
        return ReadinessCheck(
            check_id="capex_opex_misclassification",
            label="CapEx/OpEx misclassification",
            status="pass",
            severity="medium",
            description="No likely capital expenditures found in operating expense accounts (4xxx).",
            affected_amount=None,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="capex_opex_misclassification",
        label="CapEx/OpEx misclassification",
        status="fail",
        severity="medium",
        description=(
            f"{len(flagged)} entry/entries in operating expense accounts (4xxx) with asset-like "
            f"descriptions totalling €{total:,.2f}. "
            "These may belong in fixed asset accounts (0xxx)."
        ),
        affected_amount=total,
        source_lines=[gl_to_source_line(r) for r in flagged],
    )
