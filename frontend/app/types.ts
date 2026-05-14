export interface RatioResult {
  value: number | null
  reliable: boolean
  note: string | null
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

export interface AnalysisResult {
  readiness: DataReadinessReport
  advisory_outputs: AdvisoryOutput[] | null
  blocked_reason: string | null
  guided_response: string | null
}
