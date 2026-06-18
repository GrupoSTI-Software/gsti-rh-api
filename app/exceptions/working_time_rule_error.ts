/**
 * Error de negocio para las reglas de jornada laboral (`working_time_rules`).
 * Cubre el solapamiento de vigencias y los valores numéricos inválidos.
 */
export type WorkingTimeRuleErrorKey =
  | 'vigencia-solapada'
  | 'valores-invalidos'
  | 'override-excede-federal'
  | 'valor-fuera-de-rango'

export default class WorkingTimeRuleError extends Error {
  readonly key: WorkingTimeRuleErrorKey
  readonly title: string
  readonly detail: string

  constructor(key: WorkingTimeRuleErrorKey, title: string, detail: string) {
    super(detail)
    this.name = 'WorkingTimeRuleError'
    this.key = key
    this.title = title
    this.detail = detail
  }
}
