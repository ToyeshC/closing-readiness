from backend.models import DataReadinessReport, FinancialDataset, ReadinessCheck
from backend.services.checks import (
    ar_aging,
    bank_coverage,
    capex_opex,
    revenue_reconciliation,
    suspense,
    timing_differences,
    todo_discrepancy,
    vat_reconciliation,
)


class ReadinessEngine:
    def __init__(self, dataset: FinancialDataset) -> None:
        self.dataset = dataset

    def run(self) -> DataReadinessReport:
        checks = [
            suspense.check(self.dataset),
            todo_discrepancy.check(self.dataset),
            revenue_reconciliation.check(self.dataset),
            capex_opex.check(self.dataset),
            bank_coverage.check(self.dataset),
            ar_aging.check(self.dataset),
            timing_differences.check(self.dataset),
            vat_reconciliation.check(self.dataset),
        ]
        score, advice_ready = _score(checks)
        return DataReadinessReport(
            dataset=self.dataset,
            overall_score=score,
            advice_ready=advice_ready,
            checks=checks,
        )


def _score(checks: list[ReadinessCheck]) -> tuple[float, bool]:
    penalties = {"low": 0.03, "medium": 0.10, "high": 0.20}
    has_blocker = any(c.status == "blocker" for c in checks)
    score = max(
        0.0,
        1.0 - sum(penalties.get(c.severity, 0.0) for c in checks if c.status != "pass"),
    )
    return score, (score >= 0.6 and not has_blocker)
