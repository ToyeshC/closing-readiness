from pydantic import BaseModel
from typing import Literal
from datetime import date


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
    todo_discrepancies: list[dict]  # record/amount gaps between main and to-do folder files


class DataReadinessReport(BaseModel):
    dataset: FinancialDataset
    overall_score: float       # 0.0 to 1.0
    advice_ready: bool         # True only if zero blockers
    checks: list[ReadinessCheck]
