import asyncio
import logging
import os
import uuid
from datetime import date
from pathlib import Path

import langwatch
from fastapi import APIRouter, Body, HTTPException, Response
from pydantic import BaseModel

log = logging.getLogger(__name__)

from backend.models import DataReadinessReport, FixPlan, FixPlanItem, SourceLine
from backend.services.data_loader import load_all, load_all_from_exact
from backend.services.readiness_engine import ReadinessEngine
from backend.services.token_store import get_access_token, get_division_id, is_authenticated
from backend_FastAPI_emma.schemas import (
    AnalysisResult,
    CheckCorrelation,
    DataReadinessReportOut,
    EarlyWarning,
    InsightsResult,
    ReportOptions,
    SingleFixRequest,
    SourceLineOut,
)
from backend.services.benchmarks import fetch_sector_benchmarks
from backend_FastAPI_emma.services.fix_planner import generate_fix_plan, generate_insights, generate_letter_en, generate_letter_nl, generate_single_fix
from backend_FastAPI_emma.services.report_pdf import generate_report_html, html_to_pdf
from backend_FastAPI_emma.services.reasoning import call_claude, call_claude_guided


class FixPlanApproval(BaseModel):
    approved_items: list[str] = []   # list of check_ids the advisor approved
    notes: str = ""

router = APIRouter()

DATA_FOLDER = Path(os.environ.get("DATA_FOLDER", "00 Dataroom hackathon"))

# Module-level caches — per-worker state. Run with `uvicorn --workers 1`.
_last_report: DataReadinessReport | None = None
_last_insights: dict | None = None
_last_plan: FixPlan | None = None


def _default_period() -> tuple[date, date]:
    """Last complete calendar year — recomputed per request, never hardcoded."""
    today = date.today()
    last_year = today.year - 1
    return date(last_year, 1, 1), date(last_year, 12, 31)


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
    period_start: date | None = None,
    period_end: date | None = None,
):
    global _last_report

    # Defaults computed at request time, not at import time, so the system
    # doesn't silently show stale years as more time passes.
    default_start, default_end = _default_period()
    if period_start is None:
        period_start = default_start
    if period_end is None:
        period_end = default_end
    if period_end < period_start:
        raise HTTPException(
            status_code=400,
            detail="period_end must be on or after period_start.",
        )

    try:
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
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Data loading failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Data loading failed: {exc}") from exc

    try:
        report = ReadinessEngine(dataset).run()
    except Exception as exc:
        log.exception("Readiness engine failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Readiness engine error: {exc}") from exc
    _last_report = report

    # Fetch CBS sector benchmarks in parallel with the LLM call (10s timeout, non-fatal).
    try:
        benchmarks = await asyncio.wait_for(fetch_sector_benchmarks(), timeout=10.0)
    except Exception as exc:
        log.warning("Sector benchmarks fetch failed (non-fatal): %s", exc)
        benchmarks = None

    # Unique reference for this analysis run — stored in AnalysisResult so the
    # frontend can display it as an EU AI Act Art. 13 audit trail reference.
    analysis_ref = str(uuid.uuid4())[:8].upper()

    if not report.advice_ready:
        # Data has blockers/failures — call guided-diagnosis mode instead of advisory Claude.
        # Returns structured fix instructions per failing check rather than a hard block.
        blockers = [c for c in report.checks if c.status == "blocker"]
        reason = f"{len(blockers)} blocker(s): " + ", ".join(c.label for c in blockers)
        # Run the (sync) LLM call off the event loop so it doesn't block other requests.
        try:
            guidance = await asyncio.to_thread(call_claude_guided, report)
        except Exception as exc:
            log.exception("Guided-diagnosis LLM call failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc
        return AnalysisResult(
            readiness=_to_report_out(report),
            advisory_outputs=[],
            blocked_reason=reason,
            guided_response=guidance,
            sector_benchmarks=benchmarks,
            trace_id=analysis_ref,
        )

    try:
        advisory_outputs = await asyncio.to_thread(call_claude, report)
    except Exception as exc:
        log.exception("Advisory LLM call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc
    return AnalysisResult(
        readiness=_to_report_out(report),
        advisory_outputs=advisory_outputs,
        blocked_reason=None,
        sector_benchmarks=benchmarks,
        trace_id=analysis_ref,
    )


@router.post("/fix-plan", response_model=FixPlan)
async def create_fix_plan(
    period_start: date | None = None,
    period_end: date | None = None,
):
    """Generate an AI fix plan for all failing checks in the given period."""
    default_start, default_end = _default_period()
    if period_start is None:
        period_start = default_start
    if period_end is None:
        period_end = default_end

    # Use cached report if available and period matches; otherwise re-run the engine.
    global _last_report
    if (
        _last_report is not None
        and _last_report.dataset.period_start == period_start
        and _last_report.dataset.period_end == period_end
    ):
        report = _last_report
    else:
        try:
            if is_authenticated():
                tok = await get_access_token()
                dataset = await load_all_from_exact(tok, get_division_id(), period_start, period_end)
            else:
                dataset = await load_all(
                    data_folder=DATA_FOLDER,
                    period_start=period_start,
                    period_end=period_end,
                )
        except HTTPException:
            raise
        except Exception as exc:
            log.exception("Data loading failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Data loading failed: {exc}") from exc
        try:
            report = ReadinessEngine(dataset).run()
        except Exception as exc:
            log.exception("Readiness engine failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Readiness engine error: {exc}") from exc
        _last_report = report

    try:
        plan = await asyncio.to_thread(generate_fix_plan, report)
    except Exception as exc:
        log.exception("Fix plan generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Fix plan LLM call failed: {exc}") from exc

    global _last_plan
    _last_plan = plan
    return plan


@router.post("/fix-plan/single", response_model=FixPlanItem)
async def create_single_fix(body: SingleFixRequest):
    """Generate a fix item for a single check using the cached readiness report."""
    global _last_report
    if _last_report is None:
        raise HTTPException(
            status_code=409,
            detail="No readiness report cached — run POST /api/v1/readiness first.",
        )
    check = next((c for c in _last_report.checks if c.check_id == body.check_id), None)
    if check is None:
        raise HTTPException(status_code=404, detail=f"check_id '{body.check_id}' not found.")
    if check.status == "pass":
        raise HTTPException(status_code=400, detail="Check is passing — no fix needed.")
    try:
        item = await asyncio.to_thread(
            generate_single_fix,
            check,
            _last_report.dataset.period_start,
            _last_report.dataset.period_end,
        )
    except Exception as exc:
        log.exception("Single fix plan generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Fix plan LLM call failed: {exc}") from exc
    if item is None:
        raise HTTPException(status_code=502, detail="LLM returned no fix item.")
    return item


@router.put("/fix-plan/{plan_id}/approve")
@langwatch.trace(name="fix_plan_approval")
async def approve_fix_plan(plan_id: str, body: FixPlanApproval):
    """Record the advisor's approval decision — logged to LangWatch for EU AI Act Article 14 audit trail."""
    log.info(
        "Fix plan approved: plan_id=%s approved_items=%s notes=%r",
        plan_id, body.approved_items, body.notes,
    )
    return {"logged": True, "plan_id": plan_id, "approved_items": body.approved_items}


@router.post("/insights", response_model=InsightsResult)
async def get_insights():
    """Generate AI insights for the cached readiness report."""
    global _last_report
    if _last_report is None:
        raise HTTPException(
            status_code=409,
            detail="No readiness report cached — run POST /api/v1/readiness first.",
        )
    try:
        data = await asyncio.to_thread(generate_insights, _last_report)
    except Exception as exc:
        log.exception("Insights generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Insights LLM call failed: {exc}") from exc

    warnings: list[EarlyWarning] = []
    for w in (data.get("early_warnings") or []):
        try:
            warnings.append(EarlyWarning(**w))
        except Exception:
            pass

    correlations: list[CheckCorrelation] = []
    for c in (data.get("check_correlations") or []):
        try:
            correlations.append(CheckCorrelation(**c))
        except Exception:
            pass

    global _last_insights
    _last_insights = data

    return InsightsResult(
        whats_working=data.get("whats_working"),
        early_warnings=warnings,
        check_correlations=correlations,
        client_letter=data.get("client_letter"),
    )


@router.post("/report/pdf")
async def download_pdf_report(options: ReportOptions = Body(default_factory=ReportOptions)):
    """Generate a downloadable PDF report from the cached readiness data."""
    global _last_report, _last_insights, _last_plan
    if _last_report is None:
        raise HTTPException(
            status_code=409,
            detail="No readiness report cached — run POST /api/v1/readiness first.",
        )

    letter_text: str | None = None
    if options.include_letter:
        if options.language == "nl":
            letter_text = (_last_insights or {}).get("client_letter_nl") or None
            if not letter_text:
                try:
                    letter_text = await asyncio.to_thread(
                        generate_letter_nl, _last_report, _last_insights or {}
                    )
                except Exception as exc:
                    log.warning("Dutch letter generation failed (non-fatal): %s", exc)
        else:
            try:
                letter_text = await asyncio.to_thread(
                    generate_letter_en, _last_report, _last_insights or {}
                )
            except Exception as exc:
                log.warning("English letter generation failed (non-fatal): %s", exc)

    html = generate_report_html(
        _last_report, _last_insights or {}, _last_plan, options, letter_text
    )
    try:
        pdf_bytes = await asyncio.to_thread(html_to_pdf, html)
    except Exception as exc:
        log.exception("PDF generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="closing-readiness-report.pdf"'},
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
