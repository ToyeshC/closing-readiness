from backend.models import FinancialDataset, ReadinessCheck


def check(dataset: FinancialDataset) -> ReadinessCheck:
    discrepancies = dataset.todo_discrepancies

    if not discrepancies:
        return ReadinessCheck(
            check_id="todo_discrepancy",
            label="Unimported file discrepancies",
            status="pass",
            severity="high",
            description="All import files are consistent with the main administration.",
            affected_amount=None,
            source_lines=[],
        )

    total_records = sum(int(d.get("count_diff") or 0) for d in discrepancies)
    amount_diffs = [float(d["amount_diff"]) for d in discrepancies if d.get("amount_diff") is not None]
    total_amount = sum(amount_diffs) if amount_diffs else None
    file_names = ", ".join(d.get("file", "unknown") for d in discrepancies)

    return ReadinessCheck(
        check_id="todo_discrepancy",
        label="Unimported file discrepancies",
        status="fail",
        severity="high",
        description=(
            f"{len(discrepancies)} file(s) in the 'to do' import folder differ from the main "
            f"administration ({total_records} record difference(s)): {file_names}. "
            "These entries are not yet visible in the books."
        ),
        affected_amount=total_amount,
        source_lines=[],
    )
