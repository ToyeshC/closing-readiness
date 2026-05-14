import json
import logging
import os

import anthropic
import langwatch

from backend.models import DataReadinessReport
from backend_FastAPI_emma.schemas import AdvisoryOutput

log = logging.getLogger(__name__)

# Initialise LangWatch observability. Reads LANGWATCH_API_KEY from env (set by
# load_dotenv() in main.py). Every @langwatch.trace()-decorated call appears in
# the LangWatch dashboard with the full prompt/response, latency, and token
# counts. Combined with the @langwatch.trace on ReadinessEngine.run(), the demo
# shows both the guardrail and the LLM call as spans of one trace.
langwatch.setup()

# Direct Anthropic SDK — the "responsible AI on Claude" narrative requires
# Claude actually be the model, not GPT-OSS via OpenRouter. Sonnet 4.6 balances
# reasoning capability for FACT/ASSUMPTION/ADVICE tagging with ~3-5s latency.
_anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = """You are a financial analysis assistant for a Dutch SME advisory firm (Consult&Co.).
You have been given structured financial data from Fietsatelier Morgenwind BV that has passed a \
quality assessment and is ready for analysis.

Your outputs must each be exactly one of three types:
- FACT: directly and verifiably derivable from the provided data. No inference.
- ASSUMPTION: requires inference or extrapolation. State your reasoning explicitly.
- ADVICE: a recommendation. Must be grounded in named facts and stated assumptions.

Rules you must never break:
1. Every number you state must appear verbatim in the data provided.
2. Never produce a FACT from data flagged as potentially incomplete.
3. Cite the exact source for every FACT (entity, account code, period).
4. If uncertain, say so — an honest ASSUMPTION beats a confident hallucination.
5. Return JSON only. No prose outside the JSON.

Return format:
{
  "outputs": [
    {
      "type": "FACT|ASSUMPTION|ADVICE",
      "statement": "...",
      "source": "human-readable citation e.g. P&L revenue line, account 8000, Jan-Dec 2024",
      "source_record_ids": ["id1", "id2"],
      "confidence": "high|medium|low"
    }
  ]
}

After presenting the findings, add a section comparing the company's financial \
ratios to typical Dutch SME benchmarks for a bicycle workshop of similar revenue scale \
(~€920K/year). Use your training knowledge about Dutch SME financial benchmarks. \
Label this section clearly: 'Industry context (AI-estimated — for indicative purposes only).'"""


def _summarise(entries: list[dict]) -> dict:
    if not entries:
        return {}
    total = sum(float(e.get("bedrag", 0) or 0) for e in entries)
    return {"count": len(entries), "total": round(total, 2), "sample": entries[:3]}


def _build_context(report: DataReadinessReport) -> str:
    d = report.dataset
    return json.dumps(
        {
            "period": {"start": str(d.period_start), "end": str(d.period_end)},
            "sales_summary": _summarise(d.sales_entries),
            "purchase_summary": _summarise(d.purchase_entries),
            "bank_summary": _summarise(d.bank_entries),
            "asset_register": d.asset_register[:20],
            "warnings": [
                {
                    "check": c.check_id,
                    "description": c.description,
                    "amount": c.affected_amount,
                }
                for c in report.checks
                if c.status == "warn"
            ],
            "passed_checks": [c.check_id for c in report.checks if c.status == "pass"],
        },
        default=str,
    )


@langwatch.trace(name="advisory_call")
def call_claude(report: DataReadinessReport) -> list[AdvisoryOutput]:
    context = _build_context(report)

    message = _anthropic_client.messages.create(
        model=_MODEL,
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Analyse this financial dataset and produce structured outputs:\n\n{context}",
        }],
    )
    raw = message.content[0].text.strip()

    # Some models wrap JSON in ```...``` fences; strip if present.
    if raw.startswith("```"):
        try:
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        except IndexError:
            # Single-line fenced or malformed — fall through to JSON parse failure path.
            pass

    try:
        return [AdvisoryOutput(**o) for o in json.loads(raw)["outputs"]]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        # Don't swallow silently — log so the dashboard / server logs show the failure.
        log.error("Advisory parse failed: %s | raw[:500]=%r", e, raw[:500])
        return []


@langwatch.trace(name="guided_diagnosis_call")
def call_claude_guided(report: DataReadinessReport) -> str:
    """Called when advice_ready=False. Returns JSON guidance on what to fix."""
    issues = [
        {
            "check": c.check_id,
            "status": c.status,
            "description": c.description,
            "amount": c.affected_amount,
        }
        for c in report.checks
        if c.status in ("fail", "blocker", "warn")
    ]
    prompt = f"""You are a financial data quality advisor.
The readiness engine found these issues preventing a closing advisory:

{json.dumps(issues, indent=2)}

For each issue: (1) explain in plain English what is wrong, (2) why it matters for closing,
(3) the exact step to fix it. Be direct. Prioritise blockers first.
Return JSON: {{"guidance": [{{"issue": str, "impact": str, "fix_step": str}}]}}"""

    resp = _anthropic_client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        try:
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        except IndexError:
            pass
    return raw
