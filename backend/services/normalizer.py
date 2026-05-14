import logging
from datetime import date

import pandas as pd

from backend.models import SourceLine

logger = logging.getLogger(__name__)


def _to_date(val) -> date:
    if val is None:
        return date(2000, 1, 1)
    # Exact Online returns /Date(milliseconds)/ — pandas can't parse this natively
    if isinstance(val, str) and val.startswith("/Date("):
        try:
            from datetime import datetime, timezone
            ms = int(val[6:].split(")")[0].split("+")[0].split("-")[0])
            return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()
        except Exception:
            logger.warning("Failed to parse Exact Online date: %r", val)
            return date(2000, 1, 1)
    # Text dates in Dutch sources are DD-MM-YYYY; pandas defaults to US month-first.
    if isinstance(val, str):
        try:
            ts = pd.to_datetime(val, dayfirst=True, errors="raise")
            return ts.date() if not pd.isna(ts) else date(2000, 1, 1)
        except Exception:
            logger.warning("Failed to parse text date with dayfirst: %r", val)
            return date(2000, 1, 1)
    try:
        ts = pd.Timestamp(val)
        return ts.date() if not pd.isna(ts) else date(2000, 1, 1)
    except Exception:
        logger.warning("Failed to parse date value: %r (type %s)", val, type(val).__name__)
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
