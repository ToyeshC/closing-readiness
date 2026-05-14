import logging
import os
import re
from pathlib import Path

import pdfplumber

from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_date, _to_float

logger = logging.getLogger(__name__)

_VAT_REGEX = re.compile(r"Te betalen[^\d]*([\d.,]+)")
# Resolved at call time so env-var overrides (Railway, tests) take effect.
def _vat_pdf_path() -> Path:
    return Path(os.environ.get("TAX_PDF_DIR", "demo_seed/tax_pdfs")) / "VAT_returns_2024_filed.pdf"


def _extract_pdf_vat() -> float | None:
    try:
        with pdfplumber.open(_vat_pdf_path()) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        matches = _VAT_REGEX.findall(text)
        if not matches:
            return None
        return sum(float(m.replace(".", "").replace(",", ".")) for m in matches)
    except Exception as e:
        logger.warning("VAT PDF extraction failed: %s", e)
        return None


def check(dataset: FinancialDataset) -> ReadinessCheck:
    pdf_vat = _extract_pdf_vat()

    if pdf_vat is None:
        return ReadinessCheck(
            check_id="vat_reconciliation",
            label="VAT reconciliation",
            status="warn",
            severity="medium",
            description="Could not extract VAT total from filed VAT return PDF. Manual verification required.",
            affected_amount=None,
            source_lines=[],
        )

    gl_vat = sum(
        abs(_to_float(r.get("btw_bedrag")))
        for r in dataset.gl_entries
        if r.get("btw_bedrag") is not None
        and dataset.period_start <= _to_date(r.get("boekdatum")) <= dataset.period_end
    )

    delta = abs(pdf_vat - gl_vat)
    delta_pct = delta / max(pdf_vat, 1.0)

    if delta_pct > 0.01:
        return ReadinessCheck(
            check_id="vat_reconciliation",
            label="VAT reconciliation",
            status="fail",
            severity="medium",
            description=(
                f"GL VAT (€{gl_vat:,.2f}) differs from filed VAT return total (€{pdf_vat:,.2f}) "
                f"by {delta_pct:.1%} (€{delta:,.2f}). Investigate before filing."
            ),
            affected_amount=delta,
            source_lines=[],
        )

    if delta_pct > 0.005:
        return ReadinessCheck(
            check_id="vat_reconciliation",
            label="VAT reconciliation",
            status="warn",
            severity="medium",
            description=(
                f"Minor VAT discrepancy: GL (€{gl_vat:,.2f}) vs filed return (€{pdf_vat:,.2f}), "
                f"delta {delta_pct:.2%}."
            ),
            affected_amount=delta,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="vat_reconciliation",
        label="VAT reconciliation",
        status="pass",
        severity="medium",
        description=f"GL VAT (€{gl_vat:,.2f}) reconciles with filed VAT return (€{pdf_vat:,.2f}).",
        affected_amount=None,
        source_lines=[],
    )
