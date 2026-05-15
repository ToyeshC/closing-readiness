export interface RatioResult {
  value: number | null
  reliable: boolean
  note: string | null
}

export interface AgingEntry {
  counterparty: string
  amount: number
  aging_bucket: string   // "0-30" | "31-60" | "61-90" | "90+" | "—"
  invoice_ref: string | null
}

export interface FinancialRatios {
  dso_days: RatioResult
  dpo_days: RatioResult
  working_capital: RatioResult
  revenue_period: RatioResult
  purchases_period: RatioResult
  open_ar: RatioResult
  open_ap: RatioResult
  gross_profit_margin: RatioResult
  ar_aging_detail?: AgingEntry[]
  ap_aging_detail?: AgingEntry[]
}

export interface SectorBenchmarks {
  sector_name: string
  sbi_code: string
  source: string
  reference_year: number
  gross_margin_median: number | null
  revenue_per_fte_median: number | null
  dso_days_approx: number | null
  dpo_days_approx: number | null
  notes: string
}

export interface SourceLine {
  entity: string
  record_id: string
  account_code: string
  amount: number
  date: string
  description: string
}

export interface ReadinessCheck {
  check_id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'blocker'
  severity: 'low' | 'medium' | 'high' | 'blocker'
  description: string
  affected_amount: number | null
  source_lines: SourceLine[]
  score_after_fix: number | null
}

export interface DataReadinessReport {
  overall_score: number
  advice_ready: boolean
  checks: ReadinessCheck[]
  ratios: FinancialRatios | null
}

export interface AdvisoryOutput {
  type: 'FACT' | 'ASSUMPTION' | 'ADVICE'
  statement: string
  source: string
  source_record_ids: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface FixPlanItem {
  check_id: string
  issue_summary: string
  proposed_action: string
  affected_accounts: string[]
  estimated_effort: string
  confidence: 'high' | 'medium' | 'low'
  risk_level: 'low' | 'medium' | 'high'
  supporting_data: string[]
}

export interface FixPlan {
  plan_id: string
  generated_at: string
  period_start: string
  period_end: string
  items: FixPlanItem[]
  ai_disclosure: string
}

export interface AnalysisResult {
  readiness: DataReadinessReport
  advisory_outputs: AdvisoryOutput[] | null
  blocked_reason: string | null
  guided_response: string | null
  sector_benchmarks?: SectorBenchmarks | null
  trace_id?: string | null
}
