import json
import logging
import os
import re

import anthropic
import langwatch

from backend.models import DataReadinessReport, FixPlan, FixPlanItem, ReadinessCheck

log = logging.getLogger(__name__)

langwatch.setup()

_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def _extract_json(text: str) -> str:
    """Extract a JSON object from text that may have prose or markdown code fences."""
    # Try fenced code block first (```json ... ``` or ``` ... ```)
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    # Fall back to first bare JSON object in the text
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return m.group(0)
    return text  # let json.loads raise a clear error


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
    raw = _extract_json(resp.content[0].text)

    items: list[FixPlanItem] = []
    try:
        data = json.loads(raw)
        for raw_item in (data.get("items") or []):
            try:
                items.append(FixPlanItem(**raw_item))
            except Exception as e:
                log.warning("Skipping invalid fix plan item: %s | item=%r", e, raw_item)
    except (json.JSONDecodeError, TypeError) as e:
        log.error("Fix plan parse failed: %s | raw[:500]=%r", e, raw[:500])

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
    raw = _extract_json(resp.content[0].text)

    try:
        data = json.loads(raw)
        raw_items = data.get("items") or []
        if raw_items:
            return FixPlanItem(**raw_items[0])
    except Exception as e:
        log.error("Single fix parse failed: %s | raw[:500]=%r", e, raw[:500])
    return None


_INSIGHTS_SYSTEM = """You are a financial closing advisor for Dutch SMEs.
You are given a data readiness report with passing and failing checks.

Produce structured insights in four categories:

1. whats_working: A 2-sentence summary of what is clean and in order. Include specific numbers where available.

2. early_warnings: For PASSING checks only — identify any signals that could become blockers next quarter. Be specific about the data. Omit a check if there is no credible warning signal.

3. check_correlations: Group FAILING checks that likely share a single root cause. If two failures are independent, do not group them. E.g. revenue reconciliation + VAT reconciliation failures often both stem from GL period mis-allocation.

4. client_letter_nl: A single professional Dutch paragraph (~5 sentences) the accountant can paste directly into the client advisory letter. Formal register. Begin with "In het kader van de jaarafsluiting...".

Return ONLY valid JSON, no prose:
{
  "whats_working": "2-sentence summary with numbers",
  "early_warnings": [
    {
      "check_id": "string",
      "check_label": "string",
      "signal": "specific observation from the data",
      "recommendation": "concrete next step"
    }
  ],
  "check_correlations": [
    {
      "check_ids": ["id1", "id2"],
      "explanation": "why they are linked and what to investigate first"
    }
  ],
  "client_letter_nl": "professional Dutch paragraph"
}"""


@langwatch.trace(name="insights_call")
def generate_insights(report: DataReadinessReport) -> dict:
    """Generate what's-working summary, early warnings, check correlations, and client letter draft."""
    passing = [c for c in report.checks if c.status == "pass"]
    failing = [c for c in report.checks if c.status in ("fail", "blocker", "warn")]

    prompt = f"""Closing readiness report for period {report.dataset.period_start} to {report.dataset.period_end}.

PASSING CHECKS ({len(passing)}):
{json.dumps([
    {
        "check_id": c.check_id,
        "label": c.label,
        "description": c.description,
        "source_count": len(c.source_lines),
    }
    for c in passing
], indent=2)}

FAILING CHECKS ({len(failing)}):
{json.dumps([
    {
        "check_id": c.check_id,
        "label": c.label,
        "status": c.status,
        "description": c.description,
        "amount": c.affected_amount,
    }
    for c in failing
], indent=2)}

Overall score: {report.overall_score:.0%}. Advice ready: {report.advice_ready}."""

    resp = _anthropic_client.messages.create(
        model=_MODEL,
        max_tokens=1500,
        system=_INSIGHTS_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = _extract_json(resp.content[0].text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("Insights parse failed: %s | raw[:300]=%r", e, raw[:300])
        return {}
