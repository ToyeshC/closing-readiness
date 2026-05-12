import logging
import re
from pathlib import Path

import pdfplumber

from backend.models import FinancialDataset, ReadinessCheck

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_TAX_DIR = _PROJECT_ROOT / "00 Dataroom hackathon" / "fietsatelier_morgenwind_tax_statements_filed"
_CIT_PROV_PDF = _TAX_DIR / "CIT_provisional_statement_2024_filed.pdf"
_CIT_FINAL_PDF = _TAX_DIR / "CIT_final_statement_2024_filed.pdf"

_CIT_REGEX = re.compile(r"CIT liability[^€]*€\s*([\d.]+,\d+)")

_WARN_THRESHOLD = 0.10
_FAIL_THRESHOLD = 0.25


def _extract_cit(pdf_path: Path) -> float | None:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        m = _CIT_REGEX.search(text)
        if m:
            return float(m.group(1).replace(".", "").replace(",", "."))
        return None
    except Exception as e:
        logger.warning("CIT PDF extraction failed for %s: %s", pdf_path.name, e)
        return None


def check(dataset: FinancialDataset) -> ReadinessCheck:
    provisional = _extract_cit(_CIT_PROV_PDF)
    final = _extract_cit(_CIT_FINAL_PDF)

    if provisional is None or final is None:
        missing = "provisional" if provisional is None else "final"
        return ReadinessCheck(
            check_id="cit_preliminary_deviation",
            label="CIT preliminary vs final assessment",
            status="warn",
            severity="medium",
            description=(
                f"Could not extract CIT amount from {missing} statement PDF. "
                "Manual verification of CIT assessment accuracy required."
            ),
            affected_amount=None,
            source_lines=[],
        )

    deviation = abs(provisional - final) / max(provisional, 1.0)
    delta = abs(provisional - final)

    if deviation > _FAIL_THRESHOLD:
        return ReadinessCheck(
            check_id="cit_preliminary_deviation",
            label="CIT preliminary vs final assessment",
            status="fail",
            severity="medium",
            description=(
                f"Large deviation between provisional CIT (€{provisional:,.2f}) and "
                f"final assessment (€{final:,.2f}): {deviation:.1%} (€{delta:,.2f}). "
                "Significant CIT interest charges likely incurred due to underestimating profit."
            ),
            affected_amount=delta,
            source_lines=[],
        )

    if deviation > _WARN_THRESHOLD:
        return ReadinessCheck(
            check_id="cit_preliminary_deviation",
            label="CIT preliminary vs final assessment",
            status="warn",
            severity="medium",
            description=(
                f"CIT preliminary estimate (€{provisional:,.2f}) differs from final "
                f"(€{final:,.2f}) by {deviation:.1%} (€{delta:,.2f}). "
                "Some CIT interest may have accrued on the underpayment."
            ),
            affected_amount=delta,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="cit_preliminary_deviation",
        label="CIT preliminary vs final assessment",
        status="pass",
        severity="medium",
        description=(
            f"CIT preliminary estimate (€{provisional:,.2f}) matches final "
            f"assessment (€{final:,.2f}) — deviation {deviation:.1%}."
        ),
        affected_amount=None,
        source_lines=[],
    )
