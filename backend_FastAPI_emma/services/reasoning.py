import json
import os

import anthropic

from backend.models import DataReadinessReport
from backend_FastAPI_emma.schemas import AdvisoryOutput

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

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
}"""


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


def call_claude(report: DataReadinessReport) -> list[AdvisoryOutput]:
    context = _build_context(report)

    message = _client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Analyse this financial dataset and produce structured outputs:\n\n{context}",
            }
        ],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        return [AdvisoryOutput(**o) for o in json.loads(raw)["outputs"]]
    except Exception:
        return []
