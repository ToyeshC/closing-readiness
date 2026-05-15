from datetime import date
from pydantic import BaseModel
from typing import Literal

# FinancialRatios is imported directly from Toyesh's models — we reuse it
# unchanged as the ratios field type in DataReadinessReportOut below.
from backend.models import FinancialRatios
from backend.services.benchmarks import SectorBenchmarks


class AdvisoryOutput(BaseModel):
    type: Literal["FACT", "ASSUMPTION", "ADVICE"]
    statement: str
    source: str                       # human-readable citation
    source_record_ids: list[str]      # links back to raw source data
    confidence: Literal["high", "medium", "low"]


# ── Why two separate report models exist ─────────────────────────────────────
#
# Toyesh's DataReadinessReport (backend/models.py) is the full internal object
# produced by ReadinessEngine.run(). It contains:
#   - dataset: FinancialDataset  ← holds all raw pandas rows as list[dict]
#   - SourceLine.raw: dict       ← holds the original pandas row per source line
#
# Both of these contain numpy types (numpy.float64, numpy.int64, etc.) that
# pydantic-core cannot serialise to JSON, causing a 500 on every response.
#
# The frontend needs none of that raw data — only the derived check results
# and ratios. So we define lean "Out" models here that mirror Toyesh's models
# exactly, minus the numpy-tainted fields.
#
# Flow:
#   ReadinessEngine.run() → DataReadinessReport  (internal, has dataset + raw)
#                                 ↓
#                     endpoint builds DataReadinessReportOut  (strips both)
#                                 ↓
#                     sent to frontend as clean JSON  (no numpy, no crash)
# ─────────────────────────────────────────────────────────────────────────────

class SourceLineOut(BaseModel):
    # Mirrors backend.models.SourceLine but drops the `raw: dict` field.
    # raw contains the original pandas DataFrame row, which has numpy types.
    entity: str
    record_id: str
    account_code: str
    amount: float
    date: date
    description: str


class ReadinessCheckOut(BaseModel):
    # Mirrors backend.models.ReadinessCheck but uses SourceLineOut so that
    # source_lines serialise cleanly without the raw pandas rows.
    check_id: str
    label: str
    status: Literal["pass", "warn", "fail", "blocker"]
    severity: Literal["low", "medium", "high", "blocker"]
    description: str
    affected_amount: float | None
    source_lines: list[SourceLineOut]
    score_after_fix: float | None = None


class DataReadinessReportOut(BaseModel):
    # Mirrors backend.models.DataReadinessReport but drops `dataset: FinancialDataset`.
    # FinancialDataset holds all the raw pandas entries (gl_entries, sales_entries,
    # bank_entries, etc.) as list[dict] — those dicts contain numpy types.
    # The frontend only needs the score, advice_ready flag, check results, and ratios.
    overall_score: float
    advice_ready: bool
    checks: list[ReadinessCheckOut]
    ratios: FinancialRatios | None = None


class SingleFixRequest(BaseModel):
    check_id: str


class EarlyWarning(BaseModel):
    check_id: str
    check_label: str
    signal: str
    recommendation: str


class CheckCorrelation(BaseModel):
    check_ids: list[str]
    explanation: str


class InsightsResult(BaseModel):
    whats_working: str | None = None
    early_warnings: list[EarlyWarning] = []
    check_correlations: list[CheckCorrelation] = []
    client_letter_nl: str | None = None


class ReportOptions(BaseModel):
    include_ratios: bool = True
    include_checks: bool = True
    include_insights: bool = True
    include_fix_plan: bool = True
    include_letter: bool = True
    notes: str = ""
    language: Literal["en", "nl"] = "en"


class AnalysisResult(BaseModel):
    # Top-level response shape returned by POST /api/v1/readiness.
    # Uses DataReadinessReportOut (not DataReadinessReport) so the full response
    # is free of numpy types and serialises cleanly.
    readiness: DataReadinessReportOut
    advisory_outputs: list[AdvisoryOutput] | None  # None when not advice_ready
    blocked_reason: str | None
    guided_response: str | None = None             # populated when advice_ready=False
    sector_benchmarks: SectorBenchmarks | None = None  # CBS StatLine sector context
    trace_id: str | None = None                    # unique analysis reference (EU AI Act Art. 13 audit trail)
