from pydantic import BaseModel
from typing import Literal

from backend.models import DataReadinessReport


class AdvisoryOutput(BaseModel):
    type: Literal["FACT", "ASSUMPTION", "ADVICE"]
    statement: str
    source: str                       # human-readable citation
    source_record_ids: list[str]      # links back to raw source data
    confidence: Literal["high", "medium", "low"]


class AnalysisResult(BaseModel):
    readiness: DataReadinessReport
    advisory_outputs: list[AdvisoryOutput] | None  # None when not advice_ready
    blocked_reason: str | None
