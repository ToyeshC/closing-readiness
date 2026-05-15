import base64
import re
from datetime import date
from pathlib import Path

from backend.models import DataReadinessReport, FixPlan

LOGO_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "consult-co-logo.svg"


def _logo_data_uri() -> str:
    if not LOGO_PATH.exists():
        return ""
    svg = LOGO_PATH.read_text(encoding="utf-8")
    # Strip fixed pt dimensions so CSS height controls rendering
    svg = re.sub(r'width="[\d.]+pt"', 'width="566pt"', svg, count=1)
    svg = re.sub(r'height="[\d.]+pt"', 'height="170pt"', svg, count=1)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()


def _badge(status: str) -> str:
    classes = {
        "pass":    "badge-pass",
        "fail":    "badge-fail",
        "warn":    "badge-warn",
        "blocker": "badge-blocker",
    }
    cls = classes.get(status, "badge-fail")
    return f'<span class="badge {cls}">{status.upper()}</span>'


def _eur(v: float | None) -> str:
    if v is None:
        return "—"
    return f"€ {v:,.2f}".replace(",", " ")


def _pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:.0%}"


def generate_report_html(
    report: DataReadinessReport,
    insights: dict,
    fix_plan: FixPlan | None,
    options,  # ReportOptions
    letter_text: str | None,
) -> str:
    logo_uri = _logo_data_uri()
    today = date.today().strftime("%d %B %Y")
    period_start = report.dataset.period_start.strftime("%d %b %Y")
    period_end = report.dataset.period_end.strftime("%d %b %Y")
    score_pct = f"{report.overall_score:.0%}"
    status_label = "Advisory Ready" if report.advice_ready else "Guided Diagnosis"

    # ── Ratios section ────────────────────────────────────────────────────────
    ratios_html = ""
    if options.include_ratios and report.ratios:
        r = report.ratios

        def ratio_row(label: str, ratio) -> str:
            val = ratio.value
            display = "—"
            if val is not None:
                if "days" in label.lower():
                    display = f"{val:.1f} days"
                elif "%" in label or "margin" in label.lower():
                    display = f"{val:.1%}"
                elif val > 10000:
                    display = _eur(val)
                else:
                    display = f"{val:.1f}"
            note = f'<br><span style="color:#9CA3AF;font-size:8pt">{ratio.note}</span>' if not ratio.reliable and ratio.note else ""
            return f"<tr><td>{label}</td><td>{display}{note}</td></tr>"

        ratios_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">Financial Ratios</h2></div>
<table>
  <thead><tr><th>Metric</th><th>Value</th></tr></thead>
  <tbody>
    {ratio_row("Days Sales Outstanding (DSO)", r.dso_days)}
    {ratio_row("Days Payable Outstanding (DPO)", r.dpo_days)}
    {ratio_row("Revenue (period)", r.revenue_period)}
    {ratio_row("Purchases (period)", r.purchases_period)}
    {ratio_row("Gross Profit Margin", r.gross_profit_margin)}
    {ratio_row("Open Accounts Receivable", r.open_ar)}
    {ratio_row("Open Accounts Payable", r.open_ap)}
    {ratio_row("Working Capital", r.working_capital)}
  </tbody>
</table>
</div>"""

    # ── Checks section ────────────────────────────────────────────────────────
    checks_html = ""
    if options.include_checks:
        rows = ""
        for c in report.checks:
            amount = _eur(c.affected_amount) if c.affected_amount is not None else "—"
            rows += f"<tr><td>{_badge(c.status)}</td><td>{c.label}</td><td>{amount}</td><td>{c.severity}</td></tr>"
        checks_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">Check Results</h2></div>
<table>
  <thead><tr><th>Status</th><th>Check</th><th>Amount</th><th>Severity</th></tr></thead>
  <tbody>{rows}</tbody>
</table>
</div>"""

    # ── Insights section ──────────────────────────────────────────────────────
    insights_html = ""
    if options.include_insights and insights:
        parts = []

        whats_working = insights.get("whats_working", "")
        if whats_working:
            parts.append(f"""
<h3 style="color:#166534;font-size:11pt;margin-bottom:6pt">What&apos;s Working</h3>
<p style="margin:0 0 12pt">{whats_working}</p>""")

        warnings = insights.get("early_warnings") or []
        if warnings:
            w_rows = ""
            for w in warnings:
                w_rows += f"""<tr>
  <td style="font-weight:bold">{w.get('check_label','')}</td>
  <td>{w.get('signal','')}</td>
  <td>{w.get('recommendation','')}</td>
</tr>"""
            parts.append(f"""
<h3 style="color:#B45309;font-size:11pt;margin-bottom:6pt">Watch Next Quarter</h3>
<table>
  <thead><tr><th>Check</th><th>Signal</th><th>Recommendation</th></tr></thead>
  <tbody>{w_rows}</tbody>
</table>""")

        correlations = insights.get("check_correlations") or []
        if correlations:
            c_rows = ""
            for corr in correlations:
                ids = " + ".join(corr.get("check_ids", []))
                c_rows += f"<tr><td><code>{ids}</code></td><td>{corr.get('explanation','')}</td></tr>"
            parts.append(f"""
<h3 style="color:#0E1A3A;font-size:11pt;margin-bottom:6pt">Root Cause Clusters</h3>
<table>
  <thead><tr><th>Linked Checks</th><th>Explanation</th></tr></thead>
  <tbody>{c_rows}</tbody>
</table>""")

        if parts:
            insights_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">AI Insights</h2></div>
{''.join(parts)}
</div>"""

    # ── Fix plan section ──────────────────────────────────────────────────────
    fix_html = ""
    if options.include_fix_plan and fix_plan and fix_plan.items:
        cards = ""
        for item in fix_plan.items:
            supporting = ", ".join(item.supporting_data) if item.supporting_data else "—"
            cards += f"""<div class="fix-card">
  <div class="fix-card-title">{item.check_id.replace("_", " ").title()}</div>
  <div class="fix-card-action">{item.proposed_action}</div>
  <div class="fix-card-meta">
    Effort: {item.estimated_effort} &nbsp;·&nbsp;
    Confidence: {item.confidence} &nbsp;·&nbsp;
    Risk: {item.risk_level} &nbsp;·&nbsp;
    Data: {supporting}
  </div>
</div>"""
        fix_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">Fix Recommendations</h2></div>
<p style="font-size:8.5pt;color:#9CA3AF;margin:0 0 12pt">{fix_plan.ai_disclosure}</p>
{cards}
</div>"""

    # ── Letter section ────────────────────────────────────────────────────────
    letter_html = ""
    if options.include_letter and letter_text:
        lang_label = "Dutch (Nederlands)" if options.language == "nl" else "English"
        letter_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">Client Advisory Letter ({lang_label})</h2></div>
<div class="letter-body">{letter_text}</div>
</div>"""

    # ── Notes section ─────────────────────────────────────────────────────────
    notes_html = ""
    if options.notes and options.notes.strip():
        notes_html = f"""
<div class="page-break">
<div class="section-header"><h2 class="section-title">Advisor Notes</h2></div>
<div class="notes-body">{options.notes}</div>
</div>"""

    logo_tag = f'<img class="logo" src="{logo_uri}" alt="Consult&amp;Co">' if logo_uri else '<strong style="font-size:18pt;color:#0E1A3A;">Consult&amp;Co</strong>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@page {{
  size: A4;
  margin: 18mm 15mm 22mm 15mm;
  @bottom-center {{
    content: "Consult\\26Co · consultenco.nl · Requires qualified advisor review · Page " counter(page) " of " counter(pages);
    font-size: 7pt;
    color: #9CA3AF;
    font-family: Georgia, serif;
  }}
}}
body {{
  font-family: Georgia, 'Times New Roman', serif;
  color: #14181F;
  font-size: 10.5pt;
  line-height: 1.55;
}}
.cover {{
  min-height: 220mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-top: 20mm;
}}
.logo {{ height: 32pt; width: auto; margin-bottom: 24pt; display: block; }}
.cover-title {{ font-size: 26pt; font-weight: bold; color: #0E1A3A; line-height: 1.15; margin: 0 0 8pt; }}
.cover-subtitle {{ font-size: 13pt; color: #6B7280; margin: 0 0 24pt; }}
.cover-meta {{ display: flex; gap: 20pt; border-top: 1pt solid #E5DFD2; padding-top: 14pt; margin-top: 14pt; }}
.cover-meta-item {{ flex: 1; }}
.cover-meta-label {{ font-size: 7pt; text-transform: uppercase; letter-spacing: 0.12em; color: #9CA3AF; margin-bottom: 3pt; }}
.cover-meta-value {{ font-size: 11pt; font-weight: bold; color: #0E1A3A; }}
.score-badge {{ display: inline-block; background: #0E1A3A; color: #FAF6EE; padding: 5pt 12pt; border-radius: 20pt; font-size: 12pt; font-weight: bold; margin-top: 14pt; }}
.section-header {{ border-bottom: 1.5pt solid #E8A8AE; padding-bottom: 5pt; margin-bottom: 14pt; margin-top: 0; }}
.section-title {{ font-size: 14pt; font-weight: bold; color: #0E1A3A; margin: 0; }}
table {{ width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 12pt; }}
th {{ background: #0E1A3A; color: #FAF6EE; padding: 5pt 8pt; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; }}
td {{ padding: 5pt 8pt; border-bottom: 0.5pt solid #E5DFD2; vertical-align: top; }}
tr:nth-child(even) td {{ background: #F9F7F3; }}
.badge {{ display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-size: 7.5pt; font-weight: bold; text-transform: uppercase; }}
.badge-pass    {{ background: #DCFCE7; color: #166534; }}
.badge-fail    {{ background: #FEF3C7; color: #92400E; }}
.badge-warn    {{ background: #FFFBEB; color: #B45309; }}
.badge-blocker {{ background: #FFF1F2; color: #C97F86; }}
.fix-card {{ border: 0.5pt solid #E5DFD2; border-radius: 5pt; padding: 9pt 11pt; margin-bottom: 9pt; }}
.fix-card-title {{ font-size: 10.5pt; font-weight: bold; color: #0E1A3A; margin-bottom: 4pt; }}
.fix-card-action {{ font-size: 9.5pt; color: #14181F; margin-bottom: 5pt; }}
.fix-card-meta {{ font-size: 8pt; color: #9CA3AF; }}
.letter-body {{ font-size: 10.5pt; line-height: 1.65; color: #14181F; white-space: pre-wrap; }}
.notes-body {{ font-size: 10pt; color: #14181F; background: #FAF6EE; border: 0.5pt solid #E5DFD2; padding: 10pt 12pt; border-radius: 4pt; white-space: pre-wrap; }}
.page-break {{ page-break-before: always; padding-top: 2mm; }}
code {{ font-family: "Courier New", monospace; font-size: 8.5pt; }}
</style>
</head>
<body>

<div class="cover">
  {logo_tag}
  <h1 class="cover-title">Financial Closing<br>Readiness Report</h1>
  <div class="cover-subtitle">Fietsatelier Morgenwind BV</div>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Period</div>
      <div class="cover-meta-value">{period_start} &ndash; {period_end}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Generated</div>
      <div class="cover-meta-value">{today}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Readiness</div>
      <div class="cover-meta-value">{score_pct}</div>
    </div>
  </div>
  <div><span class="score-badge">{status_label}</span></div>
</div>

{ratios_html}
{checks_html}
{insights_html}
{fix_html}
{letter_html}
{notes_html}

</body>
</html>"""


def html_to_pdf(html: str) -> bytes:
    from weasyprint import HTML
    return HTML(string=html).write_pdf()
