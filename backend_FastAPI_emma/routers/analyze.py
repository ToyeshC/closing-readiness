import os
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.models import DataReadinessReport, SourceLine
from backend.services.data_loader import load_all, load_all_from_exact
from backend.services.readiness_engine import ReadinessEngine
from backend.services.token_store import get_access_token, get_division_id, is_authenticated
from backend_FastAPI_emma.schemas import AnalysisResult
from backend_FastAPI_emma.services.reasoning import call_claude, call_claude_guided

router = APIRouter()

DATA_FOLDER = Path(os.environ.get("DATA_FOLDER", "00 Dataroom hackathon"))

# Module-level cache — holds the last report for source-line lookups
_last_report: DataReadinessReport | None = None


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
            readiness=report,
            advisory_outputs=[],
            blocked_reason=reason,
            guided_response=guidance,
        )

    advisory_outputs = call_claude(report)
    return AnalysisResult(readiness=report, advisory_outputs=advisory_outputs, blocked_reason=None)


@router.get("/readiness/{check_id}/sources", response_model=list[SourceLine])
def get_sources(check_id: str):
    if _last_report is None:
        raise HTTPException(
            status_code=404,
            detail="No readiness report available — run POST /api/v1/readiness first.",
        )
    for check in _last_report.checks:
        if check.check_id == check_id:
            return check.source_lines
    raise HTTPException(status_code=404, detail=f"check_id '{check_id}' not found.")
