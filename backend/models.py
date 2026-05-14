import math
from pydantic import BaseModel, field_validator
from typing import Literal
from datetime import date


def _no_nan(v):
    # Pydantic v2 accepts NaN into float fields without complaint; that lets
    # bad data flow into descriptions as the literal string "nan". Catch it
    # at the model boundary instead.
    if v is not None and isinstance(v, float) and math.isnan(v):
        raise ValueError("NaN not allowed")
    return v


class SourceLine(BaseModel):
    entity: str          # "gl_entry", "invoice", "bank_statement"
    record_id: str       # unique ID from source data
    account_code: str
    amount: float
    date: date
    description: str
    raw: dict            # full original record — never discard this


class ReadinessCheck(BaseModel):
    check_id: str        # snake_case, e.g. "suspense_account_balance"
    label: str           # human-readable, e.g. "Suspense account balance"
    status: Literal["pass", "warn", "fail", "blocker"]
    severity: Literal["low", "medium", "high", "blocker"]
    description: str     # what is wrong and why it matters, in plain English
    affected_amount: float | None
    source_lines: list[SourceLine]
    score_after_fix: float | None = None   # overall_score if this check passed; None for passing checks

    _check_no_nan = field_validator("affected_amount", "score_after_fix", mode="after")(_no_nan)


class FinancialDataset(BaseModel):
    period_start: date
    period_end: date
    gl_entries: list[dict]
    opening_balances: list[dict]
    sales_entries: list[dict]
    purchase_entries: list[dict]
    bank_entries: list[dict]
    relations: list[dict]
    asset_register: list[dict]
    intercompany: list[dict]
    tax_schedule: list[dict]
    items: list[dict]
    item_groups: list[dict]


class RatioResult(BaseModel):
    value: float | None
    reliable: bool
    note: str | None = None    # explains unreliability or data caveat

    _check_no_nan = field_validator("value", mode="after")(_no_nan)


class FinancialRatios(BaseModel):
    dso_days: RatioResult                  # Days Sales Outstanding
    dpo_days: RatioResult                  # Days Payable Outstanding
    working_capital: RatioResult           # open AR minus open AP
    revenue_period: RatioResult            # total revenue in period (from sales entries)
    purchases_period: RatioResult          # total purchases in period (from purchase entries)
    open_ar: RatioResult                   # total unmatched sales invoices in period
    open_ap: RatioResult                   # total unmatched purchase invoices in period
    gross_profit_margin: RatioResult       # (revenue - COGS) / revenue; COGS from GL 7xxx


class DataReadinessReport(BaseModel):
    dataset: FinancialDataset
    overall_score: float       # 0.0 to 1.0
    advice_ready: bool         # True only if zero blockers
    checks: list[ReadinessCheck]
    ratios: FinancialRatios | None = None

    _check_no_nan = field_validator("overall_score", mode="after")(_no_nan)
