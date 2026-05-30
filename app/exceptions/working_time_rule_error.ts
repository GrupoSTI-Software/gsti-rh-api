/**
 * Error de negocio para las reglas de jornada laboral (`working_time_rules`).
 * Cubre el solapamiento de vigencias y los valores numéricos inválidos.
 */
export default class WorkingTimeRuleError extends Error {
  readonly key: 'vigencia-solapada' | 'valores-invalidos'
  readonly title: string
  readonly detail: string

  constructor(
    key: 'vigencia-solapada' | 'valores-invalidos',
    title: string,
    detail: string
  ) {
    super(detail)
    this.name = 'WorkingTimeRuleError'
    this.key = key
    this.title = title
    this.detail = detail
  }
}
