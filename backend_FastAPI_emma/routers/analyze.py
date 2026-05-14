import os
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.models import DataReadinessReport, SourceLine
from backend.services.data_loader import load_all, load_all_from_exact
from backend.services.readiness_engine import ReadinessEngine
from backend.services.token_store import get_access_token, get_division_id, is_authenticated
from backend_FastAPI_emma.schemas import (
    AnalysisResult,
    DataReadinessReportOut,
    SourceLineOut,
)
from backend_FastAPI_emma.services.reasoning import call_claude, call_claude_guided

router = APIRouter()

DATA_FOLDER = Path(os.environ.get("DATA_FOLDER", "00 Dataroom hackathon"))

# Module-level cache — holds the last report for source-line lookups
_last_report: DataReadinessReport | None = None


def _to_report_out(report: DataReadinessReport) -> DataReadinessReportOut:
    # Converts the full internal DataReadinessReport (which contains FinancialDataset
    # and SourceLine.raw — both carrying numpy types) into the lean DataReadinessReportOut
    # that pydantic-core can serialise to JSON without a TypeError.
    # Only the fields the frontend actually needs are kept.
    return DataReadinessReportOut(
        overall_score=report.overall_score,
        advice_ready=report.advice_ready,
        ratios=report.ratios,
        checks=[
            {
                "check_id": c.check_id,
                "label": c.label,
                "status": c.status,
                "severity": c.severity,
                "description": c.description,
                "affected_amount": c.affected_amount,
                "score_after_fix": c.score_after_fix,
                # Build SourceLineOut explicitly to drop the `raw` field
                "source_lines": [
                    {
                        "entity": s.entity,
                        "record_id": str(s.record_id),
                        "account_code": str(s.account_code),
                        "amount": float(s.amount),
                        "date": s.date,
                        "description": str(s.description),
                    }
                    for s in c.source_lines
                ],
            }
            for c in report.checks
        ],
    )


@router.post("/readiness", response_model=AnalysisResult)
async def run_readiness(
    period_start: date = date(2024, 1, 1),
    period_end: date = date(2024, 12, 31),
):
    global _last_report

    # Use live Exact Online data if OAuth token is present, otherwise fall back to
    # local files — keeps demo working without credentials and enables live data
    # once the user has completed the /auth/exact/redirect flow.
    if is_authenticated():
        tok = await get_access_token()
        dataset = await load_all_from_exact(tok, get_division_id(), period_start, period_end)
    else:
        dataset = await load_all(
            data_folder=DATA_FOLDER,
            period_start=period_start,
            period_end=period_end,
        )
    report = ReadinessEngine(dataset).run()
    _last_report = report

    if not report.advice_ready:
        # Data has blockers/failures — call guided-diagnosis mode instead of advisory Claude.
        # Returns structured fix instructions per failing check rather than a hard block.
        blockers = [c for c in report.checks if c.status == "blocker"]
        reason = f"{len(blockers)} blocker(s): " + ", ".join(c.label for c in blockers)
        guidance = call_claude_guided(report)
        return AnalysisResult(
            readiness=_to_report_out(report),
            advisory_outputs=[],
            blocked_reason=reason,
            guided_response=guidance,
        )

    advisory_outputs = call_claude(report)
    return AnalysisResult(
        readiness=_to_report_out(report),
        advisory_outputs=advisory_outputs,
        blocked_reason=None,
    )


@router.get("/readiness/{check_id}/sources", response_model=list[SourceLineOut])
def get_sources(check_id: str):
    # Returns source lines for a specific check, using SourceLineOut to strip
    # the `raw` dict field that contains unserializable numpy types.
    if _last_report is None:
        raise HTTPException(
            status_code=404,
            detail="No readiness report available — run POST /api/v1/readiness first.",
        )
    for check in _last_report.checks:
        if check.check_id == check_id:
            return [
                SourceLineOut(
                    entity=s.entity,
                    record_id=str(s.record_id),
                    account_code=str(s.account_code),
                    amount=float(s.amount),
                    date=s.date,
                    description=str(s.description),
                )
                for s in check.source_lines
            ]
    raise HTTPException(status_code=404, detail=f"check_id '{check_id}' not found.")
