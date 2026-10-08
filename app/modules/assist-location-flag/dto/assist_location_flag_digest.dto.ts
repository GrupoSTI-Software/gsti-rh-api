/** Un renglón del correo: un empleado en un día del sitio. */
export interface AssistLocationFlagDigestLine {
  employeeName: string
  employeeCode: string
  /** Día en la zona del sitio, p. ej. `lunes 5 de octubre 2026`. */
  dayLabel: string
  /** Horas `HH:mm` en la zona del sitio, en orden. */
  times: string[]
  count: number
}

/** Datos de la vista `emails/assist_location_flag_digest`. */
export interface AssistLocationFlagDigestMailData {
  tradeName: string
  sidebarColor: string
  lines: AssistLocationFlagDigestLine[]
}

/** Qué pasó con una empresa en la corrida. */
export type AssistLocationFlagDigestCompanyOutcome =
  | { kind: 'sent'; assists: number }
  | { kind: 'without-recipients' }
  | { kind: 'nothing-claimed' }
  | { kind: 'simulated'; assists: number }
  | { kind: 'failed' }

/** Resumen de la corrida, para la bitácora del comando. */
export interface AssistLocationFlagDigestResult {
  companiesNotified: number
  companiesWithoutRecipients: number
  companiesSimulated: number
  companiesFailed: number
  assistsNotified: number
}
