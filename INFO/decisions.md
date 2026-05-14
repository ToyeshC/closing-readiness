# Architectural Decisions — Consult&Co Readiness Engine

Non-obvious choices made during the hackathon. Use this when judges ask "why did you do it this way?"

---

## Scoring formula

**Choice:** `score = 1.0 - sum(penalties)` where high=0.20, medium=0.10, low=0.03. `advice_ready = True` when score ≥ 0.60 and no blockers.

**Why:** Simple to explain live in 10 seconds. Thresholds map directly to severity labels — a judge can verify the math in their head. Alternatives like weighted averages or ML-based scoring would require explanation time we don't have.

---

## timing_differences: GL Periode vs boekdatum.month (not boekdatum vs vervaldatum)

**Choice:** Compare the GL `Periode` field (integer 1–12) against `boekdatum.month`. Flag entries where these differ.

**Why:** Comparing `boekdatum` (booking date) against `vervaldatum` (due date) flags every normal 30/60-day payment term as an error — nearly every invoice would trigger it. `Periode` is the accounting period the entry is actually posted to, which is what matters for period-cutoff accuracy.

---

## draft_entries check dropped — replaced by todo_discrepancy

**Choice:** No `draft_entries` check_id. Replaced by `todo_discrepancy`.

**Why:** The GL export from Exact Online has no status column. There is no way to distinguish draft from posted entries from the data alone. The signal for "not yet imported" data is the presence of files in the `import_files_final/to do/` subfolder — that's what `todo_discrepancy` captures.

---

## header=1 for relations and opening_balances files

**Choice:** Load `01_relations...` and `02_opening_balance...` with `header=1`, not the default `header=0`.

**Why:** Row 0 in these files is Dutch section-label text (e.g., "Algemeen", "Financieel"), not column names. Row 1 is the real header. Loading with default `header=0` assigns section labels as column names and drops the real header.

---

## header=None for sales and purchase files

**Choice:** Load `04_sales...` and `05_purchase...` with `header=None` and positional column mapping.

**Why:** These files have no header row at all. Column assignments come from the Exact Online positional format documented in `data_loader.py`.

---

## Period default: 2024-01-01 to 2024-12-31

**Choice:** API defaults to calendar year 2024.

**Why:** Fietsatelier Morgenwind's book year is calendar 2024. Configurable via query params (`period_start`, `period_end`) if needed for other clients.

---

## 11 checks, not the original 9

**Choice:** Started with 9 check spec → dropped 1 (`draft_entries`) → added 3 (`cit_preliminary_deviation`, `vat_provisional_correction`, `ap_aging_stale`).

**Why:** `draft_entries` was dropped because the data doesn't support it (see above). The three new checks were added on Day 3 based on organiser emails that explicitly hinted at CIT provisional assessments, VAT correction filings, and AP aging as areas of interest. All three have supporting data in the hackathon dataset.

---

## AP aging: match purchase entries to outgoing bank entries

**Choice:** Flag purchase entries (positive `bedrag`) with no matching negative bank entry within 1% tolerance, where the invoice is >90 days old.

**Why:** Same logic as AR aging but inverted — purchase entries are what we owe; negative bank entries are outgoing payments. The 1% tolerance covers minor rounding differences between invoice amounts and actual bank transfers (e.g., early payment discounts).

---

## CIT check: compare provisional vs final PDFs, not GL accounts

**Choice:** Extract CIT liability from both `CIT_provisional_statement_2024_filed.pdf` and `CIT_final_statement_2024_filed.pdf` using `pdfplumber`.

**Why:** There are no CIT-specific GL entries in the dataset (GL account 1880 is in the tax schedule, not the GL). The PDFs are the authoritative source for filed CIT figures.

---

## VAT provisional check: tax_schedule payment counts per quarter

**Choice:** Count VAT payment rows per quarter in `tax_payment_schedule.csv`. Multiple payments for the same quarter = correction filing signal.

**Why:** GL account 1870 has zero entries in the dataset — VAT doesn't appear in the GL. The tax schedule is the only source of payment-level granularity. A correction filing would appear as an additional payment row for the same quarter reference.

---

## Financial ratios: greedy amount-matching, period-filtered

**Choice:** Open AR/AP computed by matching invoice amounts to bank entries using a greedy pool (exact key first, then within 1% tolerance). Period filter applied: only invoices dated within `[period_start, period_end]` counted.

**Why:** The sales/purchase entry files cover 2024 and 2025. Without period filtering, 2025 invoices inflated open AR from €91K to €280K, pushing DSO from 36 days to 199 days. The 1% tolerance covers common rounding differences between invoiced and paid amounts. Same logic as existing ar_aging/ap_aging checks — consistent by design.

---

## UX pivot: advice_ready=False triggers guided-diagnosis, not hard block

**Choice:** When `advice_ready=False`, still call Claude with a guidance-mode system prompt (list of failing checks + amounts). Returns a prioritised fix list. The readiness gate is still the gatekeeper — Claude never produces a closing advisory on dirty data — but it can explain what to fix.

**Why:** Organiser feedback on Day 4: "If the model says no, it should say why no and what to fix." A hard block with a status message leaves the user stuck. Guided diagnosis keeps the "responsible AI" story while being actually useful. Claude advises on the data quality problem, not on the financial data itself.

---

## CIT check: absolute € threshold added alongside percentage threshold

**Choice:** `cit_preliminary_deviation` warns if `abs(provisional - final) > €5,000` regardless of the percentage deviation (`_WARN_ABSOLUTE = 5_000.0`).

**Why:** Organiser explicitly flagged this on Day 4: "5% of a large base is a large number." For a company with €96K CIT liability, a 3% deviation is €2,880 — fine. But if the base were €1M, 3% = €30K in interest exposure. The absolute threshold catches cases the percentage threshold misses.

---

## Exact Online loader: local file loading retained as fallback

**Choice:** `load_all_from_exact()` added alongside `load_all()` in `data_loader.py`. `analyze.py` picks the loader based on whether an OAuth token exists. Local file loading is not removed.

**Why:** Exact Online OAuth credentials not yet received at time of implementation. Demo must still work with local files. The field mapping is an internal detail of `load_all_from_exact()` — all checks consume `FinancialDataset` regardless of source, so zero check changes needed when switching loaders.

---

# Decisions, Day 5 final session (2026-05-14)

After Emma handed off the full stack, an adversarial audit surfaced ~30 backend and frontend findings. The decisions below cover what we fixed before the demo, what we deferred, and the framing for production. They supersede some earlier choices.

---

## NaN→None fix: root-cause in loader, not band-aid in checks

**Choice:** Replace `df.where(pd.notna(df), None).to_dict(orient="records")` in `data_loader.py` with an explicit post-conversion comprehension that genuinely converts NaN floats to Python `None`. Add a Pydantic field validator on `affected_amount`, `score_after_fix`, `overall_score`, and `RatioResult.value` that rejects NaN as defense-in-depth.

**Why:** The pandas idiom looks correct but doesn't work for numeric columns — pandas re-coerces `None` back to NaN at dtype-preserving substitution. The downstream effect was `vat_reconciliation.description` containing the literal text "GL VAT (€nan) reconciles..." while returning `status="pass"`. A check could patch its own f-string, but every check using `_to_float(nan) → nan` arithmetic would have the same bug. Fixing at the loader (a single 4-line helper `_records_with_none`) means none of the 10 checks need to know about it. Pydantic validators ensure regressions surface as 500 errors instead of silent "nan" text.

**Alternative considered:** Add `if math.isnan(v): v = None` guards inside each check's f-strings. Rejected — bug-prone and would need to be repeated across every numeric format string in the codebase.

---

## Bank coverage: intersect bank dates with business-day set

**Choice:** `bank_dates &= bday_set` before computing coverage in `bank_coverage.py`.

**Why:** The previous formula `len(bank_dates) / total_bdays` allowed weekend/holiday entries (interest accruals, end-of-month closings) to inflate the numerator without raising the denominator. Real-world data has 65 such weekend entries in 2024 — they pushed reported coverage from a true 60% (FAIL) to an inflated 85% (WARN). The check was reporting that coverage is fine when it isn't. After the fix, the demo correctly fails this check, which makes the engine's value clearer to judges.

---

## AR/AP/ratio matching: gross (incl. VAT), not ex-VAT

**Choice:** In `ar_aging.py`, `ap_aging.py`, and `financial_ratios._open_invoices`, compute the match key as `_to_float(bedrag) + _to_float(btw_bedrag)` instead of just `bedrag`.

**Why:** Sales/purchase rows have ex-VAT `bedrag` (col 19) and `btw_bedrag` (col 21) in the positional file. Bank payments are gross. Matching ex-VAT against gross with a 1% tolerance can't survive Dutch 21% VAT — almost every invoice falsely appeared unmatched. The previous test suite passed only because the matching pool was big enough that *some* random bank entries fell within tolerance of *some* random invoices. The fix dropped open AR from €91K to €21K and DSO from 36 days to 8.3 days. The new values are mathematically correct — the old were noise. We had to relax the DSO/DPO plausible-range test bounds because the *bug* shaped the original ranges.

**Alternative considered:** Build a proper bipartite matching algorithm (Hungarian or stable matching) using `(date, counterparty, amount)` triples. Rejected for time — deferred to Phase 8.

---

## OAuth: HttpOnly state cookie, not server-side state table

**Choice:** `/auth/exact/redirect` generates `secrets.token_urlsafe(32)`, sets it as an HttpOnly cookie (`secure=True` when `FRONTEND_URL` starts with `https://`, `samesite="lax"` to survive the OAuth round-trip), and includes the same value in the OAuth authorize URL. `/callback` rejects with 400 if the state query param doesn't match the cookie. Cookie is cleared on successful callback.

**Why:** The single-row token store was hijackable — anyone who reached `/auth/exact/callback?code=fake` could overwrite the legitimate Exact Online tokens with their own. CSRF state is the standard fix. Cookie-based state (vs server-side table) is enough for single-instance deployments and doesn't add a SQLite table that has to be cleaned up. The TTL is the cookie max-age (10 min); attempts after that fail naturally.

**Alternative considered:** Use a `pending_states` SQLite table. Rejected as overengineered for the threat model — cookie-based state covers the same attack and adds zero state to track.

---

## Refresh token concurrency: asyncio.Lock with double-check

**Choice:** Module-level `asyncio.Lock` in `token_store.py`. `get_access_token()` re-reads the row *inside* the lock so the second waiter picks up the fresh token from the first refresh rather than racing.

**Why:** Exact Online rotates refresh tokens on each use. Two concurrent backend calls during the refresh window would both try to consume the same refresh token; the loser gets `invalid_grant` and the next call corrupts state with stale tokens. The lock + re-read pattern is standard for this case; it serializes only the refresh path, not the common-case cache hit.

---

## LLM: direct Anthropic SDK with claude-sonnet-4-6

**Choice:** Swap from OpenRouter pointing at `openai/gpt-oss-120b:free` to direct `anthropic` SDK with `claude-sonnet-4-6`. Model overridable via `ANTHROPIC_MODEL` env var. Drop `openai` from `requirements.txt`.

**Why:** Three reasons:
1. **Narrative coherence.** The hackathon's "responsible AI" story is built around Claude specifically. Demoing with GPT-OSS-120b proxied via OpenRouter contradicts that framing the moment a judge asks "what model is this?"
2. **Latency.** The free OpenRouter tier had ~50s per LLM call (two calls worst case = 100s demo lag). Sonnet 4.6 is ~3–5s per call, end-to-end demo flow under 15s.
3. **Reliability.** Direct Anthropic SDK has fewer hops, fewer proxies, fewer rate-limit surprises.

**Alternative considered:** Stay on OpenRouter but switch the model env var to `anthropic/claude-sonnet-4-5`. Functional but adds a hop and a vendor dependency we don't need.

**Why Sonnet 4.6 specifically (not Haiku, not Opus):**
- Haiku 4.5 is faster but underpowered for structured-output reasoning over FACT/ASSUMPTION/ADVICE tagging with citations. The output quality matters for the advisory cards.
- Opus 4.7 is sharper but ~2x slower and ~5x more expensive. Marginal quality lift for a hackathon demo doesn't justify the latency hit.
- Sonnet 4.6 is the sweet spot — production-grade reasoning, sub-5s, reasonable cost.

---

## Tax PDFs: ship in repo as demo_seed/, not gitignored

**Choice:** Move `CIT_*_filed.pdf`, `VAT_returns_*_filed.pdf`, and `Wage_tax_statement_*_filed.pdf` from `00 Dataroom hackathon/fietsatelier_morgenwind_tax_statements_filed/` (gitignored) to `demo_seed/tax_pdfs/` (committed). The three PDF-based checks read from `os.environ.get("TAX_PDF_DIR", "demo_seed/tax_pdfs")` instead of a hardcoded `_PROJECT_ROOT / "00 Dataroom hackathon/..."` path.

**Why:** The PDFs are explicitly labeled "Fictief document voor AI in Finance hackathon" (confirmed in the extracted text) — they're synthetic, not real client data, safe to commit. Keeping them in the gitignored client-data folder meant Railway deploys silently degraded — three medium-severity checks always returned "Could not extract" warnings on production, dragging the baseline score by 0.30. The env-var path lets us keep the production design clean: API for live bookkeeping, file system for tax filings (which Exact Online doesn't expose), with each path independently configurable.

**Alternative considered:** Build a file-upload widget so the client uploads PDFs at runtime. The right production design — deferred to Phase 8 for time.

---

## Dynamic last-complete-year defaults (no more hardcoded 2024)

**Choice:** Backend `period_start`/`period_end` defaults compute `date.today().year - 1` at request time. Frontend date pickers compute the same in `useState` initializer. Dev scripts (`engine_test.py`, `scripts/smoke_test.py`) accept `--start`/`--end` CLI flags with the same computed default.

**Why:** Hardcoded `date(2024, 1, 1)` defaults age badly — in 2027 the demo would still default to 2024. "Last complete calendar year" is what an accountant naturally reaches for when running a year-end readiness check. Tests stay pinned to 2024 (their fixture data is 2024-specific).

---

## Frontend: mirror consultenco.nl, don't reinvent

**Choice:** Deep navy primary, warm cream surface, soft rose accent. Inter font (close proxy for the marketing site's geometric sans). Status badges: navy=pass, rose-deep=blocker, amber=fail+warn. Score gauge: SVG circular gauge with threshold tick at 60%. Subtle animations (400ms fade-in-up for tiles, 700ms easeOut for gauge fill), honoring `prefers-reduced-motion`.

**Why:** The judging criterion isn't visual design, but a generic-looking SaaS frontend reads "hackathon" while a branded one reads "real firm tool." Mirroring the existing Consult&Co identity gives the demo a coherent "this is a Consult&Co product" feel without inventing a separate visual language. Inter is free, ships well with `next/font/google`, and is close enough to the site's font that judges won't notice.

**Alternative considered:** Bring in a third-party design lib like `nexu-io/open-design`. Rejected — unknown integration risk 24 hours before demo, no time to validate.

**Why subtle motion (not pronounced):** Numbers counting up and card flips are demo-grabby but trigger motion-sickness flags and look gimmicky in a financial-tools context. The subtle pattern (entrance fade + score-fill) feels premium without distracting from the data.

---

## Architecture: keep 3-screen flow, add executive summary as Home post-run state

**Choice:** Home becomes two-mode based on `localStorage`. First visit: pre-run controls (auth + dates + Run). Post-run: executive summary (score gauge + KPI tiles + top-3 issues + CTAs + collapsible re-run drawer). Report and Advisory screens unchanged structurally; refreshed visually with shared components.

**Why:** A new top-level dashboard screen would have meant 4 screens and a navigation rethink. Splitting Home into pre/post states reuses the existing route and gives the demo a clear "before" (Run) and "after" (Summary) pivot. The re-run drawer keeps live re-runs in-place — the demo can show the same flow on a different period without leaving the screen.

---

## Frontend takeover from Emma

**Choice:** Toyesh owns frontend + backend after Emma's Day 5 handoff. Emma confirmed she won't push more to `main`. CLAUDE.md updated to reflect single-owner; team-split language removed.

**Why:** Emma got stuck on the OAuth ngrok IPv6 quirk and other integration glue late on Day 5. Rather than pair-fix under demo pressure, the cleaner move was a full handoff — one person can move faster than two in the last 24h. Her work shipped (FastAPI routes, Next.js scaffold, LangWatch tracing, guided-diagnosis path) and was merged to `main` before the handoff, so this is a clean takeover, not a fork.

---

## Railway: Volume mount at /data, not Postgres

**Choice:** OAuth tokens persist on a Railway Volume mounted at `/data`, with `TOKEN_DB_PATH=/data/oauth_tokens.db`. The token store is still SQLite.

**Why:** Without a Volume, Railway's ephemeral filesystem wipes `oauth_tokens.db` on every redeploy and the user has to re-authenticate Exact Online. Postgres would solve this too but adds a new service, a new connection string, and dependency setup time we don't have. The token store is one row — SQLite on a Volume is fine. The `_get_db_path()` function already reads from `TOKEN_DB_PATH`, so the only required change is the env var.

---

## Deferred deliberately (in scope, dropped for time)

- AR/AP proper bipartite matching by `(date, counterparty, amount)`.
- Per-request report cache keyed by `report_id` (replaces module-level `_last_report`).
- Vetted Dutch SME benchmarks reference table (currently the system prompt asks the LLM to "use training knowledge" — hallucination risk).
- Server-side report storage (replaces 5MB localStorage cap).
- Dark-mode brand palette.
- File-upload widget for tax PDFs (would replace `demo_seed/`).

These all have stronger production arguments than what we shipped. They didn't move the demo needle in 24h.
