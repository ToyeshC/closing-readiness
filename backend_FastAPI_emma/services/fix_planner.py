import json
import logging
import os
import re

import anthropic
import httpx
import langwatch

from backend.models import DataReadinessReport, FixPlan, FixPlanItem, ReadinessCheck

log = logging.getLogger(__name__)

langwatch.setup()

_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
_OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
_OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")


def _call_openrouter(system: str, user: str, max_tokens: int) -> str:
    if not _OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set — no fallback available")
    log.warning("Anthropic credits exhausted — falling back to OpenRouter (%s)", _OPENROUTER_MODEL)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {_OPENROUTER_API_KEY}", "Content-Type": "application/json"},
        json={"model": _OPENROUTER_MODEL, "max_tokens": max_tokens, "messages": messages},
        timeout=90.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _call_llm(system: str, user: str, max_tokens: int) -> str:
    """Call Anthropic; fall back to OpenRouter on credit exhaustion."""
    try:
        kwargs: dict = {"model": _MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": user}]}
        if system:
            kwargs["system"] = system
        resp = _anthropic_client.messages.create(**kwargs)
        return resp.content[0].text.strip()
    except anthropic.APIStatusError as e:
        if e.status_code in (400, 429) and ("credit" in str(e).lower() or "balance" in str(e).lower()):
            return _call_openrouter(system, user, max_tokens)
        raise


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
2. proposed_action must be a specific Exact Online action (e.g., "Open Exact Online → Financial → Journal Entries → filter account 1250 → reclassify each entry to the correct account"). Keep proposed_action under 40 words.
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

    raw = _extract_json(_call_llm(_FIX_PLAN_SYSTEM, prompt, 4096))

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

    raw = _extract_json(_call_llm(_FIX_PLAN_SYSTEM, prompt, 512))

    try:
        data = json.loads(raw)
        raw_items = data.get("items") or []
        if raw_items:
            return FixPlanItem(**raw_items[0])
    except Exception as e:
        log.error("Single fix parse failed: %s | raw[:500]=%r", e, raw[:500])
    return None


_LETTER_EN_SYSTEM = """You are a financial closing advisor writing a professional advisory letter for a Dutch SME client.
Write a single formal English paragraph (~5 sentences) that an accountant can include in a client advisory letter.
Cover the key data quality findings, overall readiness score, and next steps.
Start with "In the context of the annual closing review for...".
Return only the letter paragraph, no other text."""


@langwatch.trace(name="letter_en_call")
def generate_letter_en(report, insights: dict) -> str:
    """Generate an English version of the client advisory letter."""
    whats_working = insights.get("whats_working", "")
    blockers = [c for c in report.checks if c.status == "blocker"]
    failing = [c for c in report.checks if c.status in ("fail", "warn")]

    prompt = f"""Generate an English advisory letter paragraph for this closing readiness report.

Period: {report.dataset.period_start} to {report.dataset.period_end}
Overall score: {report.overall_score:.0%}
Advice ready: {report.advice_ready}

Blockers ({len(blockers)}): {', '.join(c.label for c in blockers) or 'None'}
Failing checks ({len(failing)}): {', '.join(c.label for c in failing) or 'None'}
What is working: {whats_working or 'Not yet analysed'}"""

    return _call_llm(_LETTER_EN_SYSTEM, prompt, 600)


_LETTER_NL_SYSTEM = """U bent een Nederlandse financieel adviseur. Schrijf een beknopte sluitingsgereedheidsbrief in formeel Nederlands (max 250 woorden).
Vermeld de periode, de overall score, de belangrijkste bevindingen en aanbevolen vervolgstappen.
Begin met "In het kader van de jaarafsluiting...".
Onderteken als "Consult&Co Financieel Advies".
Geef alleen de brieftekst terug, geen andere tekst."""


@langwatch.trace(name="letter_nl_call")
def generate_letter_nl(report, insights: dict) -> str:
    """Generate a Dutch version of the client advisory letter as fallback."""
    whats_working = insights.get("whats_working", "")
    blockers = [c for c in report.checks if c.status == "blocker"]
    failing = [c for c in report.checks if c.status in ("fail", "warn")]

    prompt = f"""Genereer een Nederlandse adviesbrief voor dit sluitingsgereedheidsrapport.

Periode: {report.dataset.period_start} tot {report.dataset.period_end}
Overall score: {report.overall_score:.0%}
Advies gereed: {report.advice_ready}

Blokkades ({len(blockers)}): {', '.join(c.label for c in blockers) or 'Geen'}
Falende checks ({len(failing)}): {', '.join(c.label for c in failing) or 'Geen'}
Wat werkt goed: {whats_working or 'Nog niet geanalyseerd'}"""

    return _call_llm(_LETTER_NL_SYSTEM, prompt, 600)


_INSIGHTS_SYSTEM = """You are a financial closing advisor for Dutch SMEs.
Respond in English throughout.
You are given a data readiness report with passing and failing checks.

Respond in English for all fields (whats_working, early_warnings, check_correlations).
The client_letter_nl field must be in formal Dutch only.

Produce structured insights in four categories:

1. whats_working: A 2-sentence summary of what is clean and in order. Include specific numbers where available.

2. early_warnings: For PASSING checks only — identify any signals that could become blockers next quarter. Be specific about the data. Omit a check if there is no credible warning signal.

3. check_correlations: Group FAILING checks that likely share a single root cause. If two failures are independent, do not group them. E.g. revenue reconciliation + VAT reconciliation failures often both stem from GL period mis-allocation.

4. client_letter: A single professional English paragraph (~5 sentences) the accountant can paste directly into the client advisory letter. Formal register. Begin with "In the context of the year-end closing...".

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
  "client_letter": "professional English paragraph"
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

    raw = _extract_json(_call_llm(_INSIGHTS_SYSTEM, prompt, 1500))
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("Insights parse failed: %s | raw[:300]=%r", e, raw[:300])
        return {}
