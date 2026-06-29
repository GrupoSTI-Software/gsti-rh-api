export type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'
export type TabulationScope = 'overall' | 'category' | 'domain'

export type AggregationFn = (values: number[]) => number

export type ScaleOption = {
  key: string
  value: number
  reverseValue?: number
}

export type ThresholdInput = {
  scope: TabulationScope
  targetCode: string | null
  level: RiskLevel
  min: number
  max: number
  ord: number
}

export type QuestionScoringInput = {
  questionId: number
  optionKey: string
}

export type EmployeeResponseInput = {
  employeeId: number
  answers: QuestionScoringInput[]
}

export type QuestionDefinitionInput = {
  questionId: number
  categoryCode: string
  domainCode: string | null
  isReverseScored: number
  weight: number
  options: ScaleOption[]
}

export interface ScoringInput {
  applicationId: number
  instrumentCode: string
  responses: EmployeeResponseInput[]
  questionDefinitions: QuestionDefinitionInput[]
  thresholds: ThresholdInput[]
  aggregationFn?: AggregationFn
}

export interface OverallResult {
  score: number
  riskLevel: RiskLevel | null
}

export interface CategoryResult {
  code: string
  score: number
  riskLevel: RiskLevel | null
  respondersCount: number
}

export interface DomainResult {
  code: string
  categoryCode: string
  score: number
  riskLevel: RiskLevel | null
  respondersCount: number
}

export interface EmployeeResult {
  employeeId: number
  score: number
  riskLevel: RiskLevel | null
}

export interface TabulationResult {
  applicationId: number
  instrumentCode: string
  respondersCount: number
  overall: OverallResult
  categories: CategoryResult[]
  domains: DomainResult[]
  employees: EmployeeResult[]
}
