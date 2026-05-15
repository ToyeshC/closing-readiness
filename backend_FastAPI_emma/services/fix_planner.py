import json
import logging
import os

import anthropic
import langwatch

from backend.models import DataReadinessReport, FixPlan, FixPlanItem, ReadinessCheck

log = logging.getLogger(__name__)

langwatch.setup()

_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

_FIX_PLAN_SYSTEM = """You are a financial closing advisor for Dutch SMEs. You have been given a data readiness report showing which checks have failed.

Your task: produce a concrete, step-by-step fix plan that a human bookkeeper can execute in Exact Online.

Rules:
1. Each item covers exactly one failing check.
2. proposed_action must be a specific Exact Online action (e.g., "Open Exact Online → Financial → Journal Entries → filter account 1250 → reclassify each entry to the correct account").
3. Every number you reference must come verbatim from the issues list provided.
4. confidence reflects how certain you are the proposed action will resolve the issue.
5. risk_level reflects the risk of executing this action incorrectly (high = irreversible or regulatory impact).
6. estimated_effort must be one of: "< 5 minutes", "30 minutes", "1-2 hours", "Half day", "Requires accountant review".
7. Return JSON only. No prose outside the JSON.

Return format:
{
  "items": [
    {
      "check_id": "snake_case_check_id",
      "issue_summary": "one sentence plain English",
      "proposed_action": "specific step-by-step Exact Online action",
      "affected_accounts": ["1250", "4xxx"],
      "estimated_effort": "1-2 hours",
      "confidence": "high|medium|low",
      "risk_level": "low|medium|high",
      "supporting_data": ["€86,436.56", "39 entries"]
    }
  ]
}"""


@langwatch.trace(name="fix_planner_call")
def generate_fix_plan(report: DataReadinessReport) -> FixPlan:
    issues = [
        {
            "check_id": c.check_id,
            "label": c.label,
            "status": c.status,
            "description": c.description,
            "amount": c.affected_amount,
        }
        for c in report.checks
        if c.status in ("fail", "blocker", "warn")
    ]

    prompt = f"""Generate a fix plan for these data quality issues found in the closing readiness check:

{json.dumps(issues, indent=2)}

Period: {report.dataset.period_start} to {report.dataset.period_end}

Prioritise blockers first, then high severity, then medium."""

    resp = _anthropic_client.messages.create(
        model=_MODEL,
        max_tokens=2048,
        system=_FIX_PLAN_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()

    if raw.startswith("```"):
        try:
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        except IndexError:
            pass

    try:
        data = json.loads(raw)
        items = [FixPlanItem(**item) for item in data.get("items", [])]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        log.error("Fix plan parse failed: %s | raw[:500]=%r", e, raw[:500])
        items = []

    return FixPlan(
        period_start=report.dataset.period_start,
        period_end=report.dataset.period_end,
        items=items,
    )


@langwatch.trace(name="single_fix_call")
def generate_single_fix(check: ReadinessCheck, period_start, period_end) -> FixPlanItem | None:
    """Generate a fix plan item for a single failing check."""
    issue = [
        {
            "check_id": check.check_id,
            "label": check.label,
            "status": check.status,
            "description": check.description,
            "amount": check.affected_amount,
        }
    ]

    prompt = f"""Generate a fix plan for this single data quality issue:

{json.dumps(issue, indent=2)}

Period: {period_start} to {period_end}"""

    resp = _anthropic_client.messages.create(
        model=_MODEL,
        max_tokens=512,
        system=_FIX_PLAN_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()

    if raw.startswith("```"):
        try:
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        except IndexError:
            pass

    try:
        data = json.loads(raw)
        items = data.get("items", [])
        if items:
            return FixPlanItem(**items[0])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        log.error("Single fix parse failed: %s | raw[:500]=%r", e, raw[:500])
    return None
