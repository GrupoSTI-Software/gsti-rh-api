export type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'

export const RISK_SEVERITY_ORD: Record<RiskLevel, number> = {
  nulo: 1,
  bajo: 2,
  medio: 3,
  alto: 4,
  muy_alto: 5,
}
