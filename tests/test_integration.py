"""Integration smoke test — loads the real data files and confirms no crashes."""
import asyncio
from pathlib import Path
from datetime import date

import pytest

from backend.services.data_loader import load_all

DATA_FOLDER = Path(__file__).parent.parent / "00 Dataroom hackathon"
PERIOD_START = date(2024, 1, 1)
PERIOD_END = date(2024, 12, 31)


@pytest.fixture(scope="module")
def dataset():
    return asyncio.run(load_all(DATA_FOLDER, PERIOD_START, PERIOD_END))


def test_data_folder_exists():
    assert DATA_FOLDER.exists(), f"Data folder not found at {DATA_FOLDER}"


def test_gl_entries_loaded(dataset):
    assert len(dataset.gl_entries) > 0, "GL entries empty — check path or sheet name"


def test_bank_entries_loaded(dataset):
    assert len(dataset.bank_entries) > 0, "Bank entries empty"


def test_sales_entries_loaded(dataset):
    assert len(dataset.sales_entries) > 0, "Sales entries empty"


def test_purchase_entries_loaded(dataset):
    assert len(dataset.purchase_entries) > 0, "Purchase entries empty"


def test_gl_entry_has_expected_fields(dataset):
    entry = dataset.gl_entries[0]
    # Confirm Dutch column names loaded correctly (loader normalizes them)
    assert "boekdatum" in entry or "grootboekrekening" in entry, (
        f"GL entry missing expected Dutch columns. Got: {list(entry.keys())}"
    )


def test_bank_entry_has_expected_fields(dataset):
    entry = dataset.bank_entries[0]
    assert "datum" in entry or "bedrag" in entry, (
        f"Bank entry missing expected Dutch columns. Got: {list(entry.keys())}"
    )


def test_sales_entry_has_named_columns(dataset):
    entry = dataset.sales_entries[0]
    assert "boekstuknummer" in entry, (
        f"Sales entry missing 'boekstuknummer'. Got: {list(entry.keys())}"
    )
    assert "bedrag" in entry, (
        f"Sales entry missing 'bedrag'. Got: {list(entry.keys())}"
    )


def test_todo_discrepancies_captured(dataset):
    # GL, sales, purchase only exist in to do/ — should appear as discrepancies
    assert len(dataset.todo_discrepancies) > 0, "Expected to-do discrepancies but got none"
    labels = [d["file"] for d in dataset.todo_discrepancies]
    assert "gl_entries_pending_import" in labels


def test_period_fields_set(dataset):
    assert dataset.period_start == PERIOD_START
    assert dataset.period_end == PERIOD_END
