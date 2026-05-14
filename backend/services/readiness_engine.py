import logging

from backend.models import DataReadinessReport, FinancialDataset, ReadinessCheck
from backend.services.financial_ratios import compute_ratios
from backend.services.checks import (
    ap_aging,
    ar_aging,
    bank_coverage,
    capex_opex,
    cit_preliminary_deviation,
    revenue_reconciliation,
    suspense,
    timing_differences,
    vat_provisional_correction,
    vat_reconciliation,
)

logger = logging.getLogger(__name__)

# Optional LangWatch instrumentation. Tolerant of langwatch not being installed
# or LANGWATCH_API_KEY being unset — the engine still runs without observability.
try:
    import langwatch as _langwatch
    _trace = _langwatch.trace
except Exception:
    def _trace(*args, **kwargs):
        def _decorator(fn):
            return fn
        return _decorator

_PENALTIES = {"low": 0.03, "medium": 0.10, "high": 0.20}


class ReadinessEngine:
    def __init__(self, dataset: FinancialDataset) -> None:
        self.dataset = dataset

    @_trace(name="readiness_engine")
    def run(self) -> DataReadinessReport:
        checks = [
            suspense.check(self.dataset),
            revenue_reconciliation.check(self.dataset),
            capex_opex.check(self.dataset),
            bank_coverage.check(self.dataset),
            ar_aging.check(self.dataset),
            timing_differences.check(self.dataset),
            vat_reconciliation.check(self.dataset),
            cit_preliminary_deviation.check(self.dataset),
            vat_provisional_correction.check(self.dataset),
            ap_aging.check(self.dataset),
        ]
        score, advice_ready = _score(checks)
        for c in checks:
            # Blockers gate advice_ready, not the numeric score — score_after_fix stays None for them
            if c.status != "pass" and c.severity != "blocker":
                c.score_after_fix = round(min(1.0, score + _PENALTIES.get(c.severity, 0.0)), 3)
        ratios = compute_ratios(self.dataset)
        return DataReadinessReport(
            dataset=self.dataset,
            overall_score=score,
            advice_ready=advice_ready,
            checks=checks,
            ratios=ratios,
        )


def _score(checks: list[ReadinessCheck]) -> tuple[float, bool]:
    has_blocker = any(c.status == "blocker" for c in checks)
    score = max(
        0.0,
        1.0 - sum(_PENALTIES.get(c.severity, 0.0) for c in checks if c.status != "pass"),
    )
    return score, (score >= 0.6 and not has_blocker)
