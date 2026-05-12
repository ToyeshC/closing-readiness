from datetime import date

import pandas as pd

from backend.models import SourceLine


def _to_date(val) -> date:
    if val is None:
        return date(2000, 1, 1)
    try:
        ts = pd.Timestamp(val)
        return ts.date() if not pd.isna(ts) else date(2000, 1, 1)
    except Exception:
        return date(2000, 1, 1)


def _to_float(val) -> float:
    try:
        return float(val or 0)
    except (TypeError, ValueError):
        return 0.0


def gl_to_source_line(r: dict) -> SourceLine:
    return SourceLine(
        entity="gl_entry",
        record_id=str(r.get("boekstuknummer") or ""),
        account_code=str(r.get("grootboekrekening") or ""),
        amount=_to_float(r.get("bedrag")),
        date=_to_date(r.get("boekdatum")),
        description=str(r.get("omschrijving") or ""),
        raw=r,
    )


def invoice_to_source_line(entity: str, r: dict) -> SourceLine:
    return SourceLine(
        entity=entity,
        record_id=str(r.get("boekstuknummer") or ""),
        account_code=str(r.get("grootboekrekening") or ""),
        amount=_to_float(r.get("bedrag")),
        date=_to_date(r.get("boekdatum")),
        description=str(r.get("naam") or r.get("omschrijving") or ""),
        raw=r,
    )


def bank_to_source_line(r: dict) -> SourceLine:
    return SourceLine(
        entity="bank_statement",
        record_id=str(r.get("boekstuknummer") or ""),
        account_code="",
        amount=_to_float(r.get("bedrag")),
        date=_to_date(r.get("datum")),
        description=str(r.get("naam") or r.get("omschrijving") or ""),
        raw=r,
    )
