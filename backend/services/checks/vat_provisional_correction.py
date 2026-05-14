import logging
import os
import re
from pathlib import Path

import pdfplumber

from backend.models import FinancialDataset, ReadinessCheck
from backend.services.normalizer import _to_float

logger = logging.getLogger(__name__)

# Resolved at call time so env-var overrides (Railway, tests) take effect.
def _vat_pdf_path() -> Path:
    return Path(os.environ.get("TAX_PDF_DIR", "demo_seed/tax_pdfs")) / "VAT_returns_2024_filed.pdf"

# Matches: "2024-Q1 Te betalen omzetbelasting € 35.226,14"
_VAT_QUARTERLY_REGEX = re.compile(
    r"(\d{4})-Q(\d)\s+Te betalen[^€]*€\s*([\d.]+,\d+)"
)
# Reference format in tax_schedule: VAT-FILED-2024-Q1, VAT-CORR-2024-Q1, etc.
_SCHEDULE_REF_REGEX = re.compile(r"(\d{4})-Q(\d)")

_MISMATCH_THRESHOLD = 0.01  # 1%


def _parse_dutch_float(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def _extract_quarterly_vat(pdf_path: Path) -> dict[tuple[int, int], float]:
    """Returns {(year, quarter): filed_amount}."""
    result: dict[tuple[int, int], float] = {}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        for m in _VAT_QUARTERLY_REGEX.finditer(text):
            year, q, amt = int(m.group(1)), int(m.group(2)), _parse_dutch_float(m.group(3))
            result[(year, q)] = amt
    except Exception as e:
        logger.warning("VAT PDF extraction failed: %s", e)
    return result


def check(dataset: FinancialDataset) -> ReadinessCheck:
    filed_quarterly = _extract_quarterly_vat(_vat_pdf_path())

    if not filed_quarterly:
        return ReadinessCheck(
            check_id="vat_provisional_correction",
            label="VAT provisional filing corrections",
            status="warn",
            severity="medium",
            description="Could not extract quarterly VAT amounts from filed return PDF.",
            affected_amount=None,
            source_lines=[],
        )

    # Count VAT payments per (year, quarter) from tax_schedule
    payments_per_quarter: dict[tuple[int, int], list[float]] = {}
    for r in dataset.tax_schedule:
        if str(r.get("payment_type", "")).strip().upper() != "VAT":
            continue
        ref = str(r.get("reference", ""))
        m = _SCHEDULE_REF_REGEX.search(ref)
        if not m:
            continue
        qkey = (int(m.group(1)), int(m.group(2)))
        payments_per_quarter.setdefault(qkey, []).append(
            abs(_to_float(r.get("bank_amount")))
        )

    corrections = []
    mismatches = []

    for (year, q), filed_amount in filed_quarterly.items():
        if year != dataset.period_start.year:
            continue
        payments = payments_per_quarter.get((year, q), [])
        # Multiple payments for same quarter = supplementary/correction filing
        if len(payments) > 1:
            corrections.append(
                f"Q{q} {year}: {len(payments)} VAT payments detected "
                f"(total €{sum(payments):,.2f} vs filed €{filed_amount:,.2f})"
            )
        # Single payment that doesn't match the filed amount
        if payments:
            total_paid = sum(payments)
            gap = abs(total_paid - filed_amount) / max(filed_amount, 1.0)
            if gap > _MISMATCH_THRESHOLD:
                mismatches.append(
                    f"Q{q} {year}: filed €{filed_amount:,.2f} but paid €{total_paid:,.2f} "
                    f"({gap:.1%} gap)"
                )

    if corrections or mismatches:
        issues = corrections + mismatches
        return ReadinessCheck(
            check_id="vat_provisional_correction",
            label="VAT provisional filing corrections",
            status="warn",
            severity="medium",
            description=(
                "VAT provisional correction(s) detected: "
                + "; ".join(issues)
                + ". Review whether corrections incurred interest or penalties."
            ),
            affected_amount=None,
            source_lines=[],
        )

    return ReadinessCheck(
        check_id="vat_provisional_correction",
        label="VAT provisional filing corrections",
        status="pass",
        severity="medium",
        description=(
            f"All {len([k for k in filed_quarterly if k[0] == dataset.period_start.year])} "
            "quarterly VAT filings match payment records — no provisional corrections detected."
        ),
        affected_amount=None,
        source_lines=[],
    )
