from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import gl_to_source_line


def check(dataset: FinancialDataset) -> ReadinessCheck:
    flagged = [
        r for r in dataset.gl_entries
        if str(r.get("grootboekrekening") or "").startswith("1250")
    ]
    amount = sum(abs(float(r.get("bedrag") or 0)) for r in flagged)

    if flagged:
        return ReadinessCheck(
            check_id="suspense_account_balance",
            label="Suspense account balance",
            status="blocker",
            severity="blocker",
            description=(
                f"{len(flagged)} unclassified transaction(s) totalling €{amount:,.2f} "
                "remain in suspense account 1250 (Nog te duiden). "
                "Classify all entries before closing."
            ),
            affected_amount=amount,
            source_lines=[gl_to_source_line(r) for r in flagged],
        )

    return ReadinessCheck(
        check_id="suspense_account_balance",
        label="Suspense account balance",
        status="pass",
        severity="blocker",
        description="No unclassified transactions in suspense account 1250.",
        affected_amount=None,
        source_lines=[],
    )
