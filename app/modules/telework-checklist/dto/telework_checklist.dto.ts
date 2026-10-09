import type {
  TeleworkChecklistAnswerResult,
  TeleworkChecklistApplicationStatus,
  TeleworkChecklistInvalidationReason,
  TeleworkChecklistMode,
  TeleworkChecklistOverallResult,
} from '#constants/telework_checklist'

/**
 * Contratos de la lista de verificación de teletrabajo (VLRH-H1790812613870).
 *
 * `TeleworkChecklistRegistrationInput` es la unión discriminada por `mode` que
 * consume el núcleo `register` del servicio: en `visita_csh` el servidor exige
 * `appliedAt` y `inspectorName`; en `autoaplicada` (que agregará
 * VLRH-H1791311161420) los fija el núcleo. Los DTO de salida son la superficie
 * pública del servicio (los consume el controller y las HUs hermanas).
 */

/** Respuesta de un punto tal como la entrega el cliente (previo al cálculo). */
export interface AnswerInput {
  itemId: number
  result: TeleworkChecklistAnswerResult
  observation?: string | null
}

/** Entrada del núcleo de registro: unión discriminada por `mode` (§10 del spec). */
export type TeleworkChecklistRegistrationInput =
  | {
      mode: 'visita_csh'
      appliedAt: string
      inspectorName: string
      teleworkLocationId: number | null
      notes: string | null
      answers: AnswerInput[]
    }
  | {
      mode: 'autoaplicada'
      teleworkLocationId: number | null
      notes: string | null
      answers: AnswerInput[]
    }

/** Resumen de una aplicación con `status` efectivo (vencida ya materializada). */
export interface ApplicationSummaryDto {
  applicationId: number
  mode: TeleworkChecklistMode
  status: TeleworkChecklistApplicationStatus
  overallResult: TeleworkChecklistOverallResult
  appliedAt: string
  expiresAt: string
  revalidationPeriodMonths: number
  appliedByUserId: number
  invalidatedAt: string | null
  invalidationReason: TeleworkChecklistInvalidationReason | null
}

/** Respuesta de un punto con su código y etiqueta ya resueltos. */
export interface ApplicationAnswerDto {
  itemId: number
  code: string
  label: string
  result: TeleworkChecklistAnswerResult
  observation: string | null
}

/**
 * Detalle de una aplicación. Sin el domicilio del lugar: solo su id (la
 * dirección no viaja al BO, §13 del spec).
 */
export type ApplicationDetailDto = ApplicationSummaryDto & {
  employeeId: number
  teleworkLocationId: number | null
  inspectorName: string | null
  notes: string | null
  answers: ApplicationAnswerDto[]
}

/** Historial de un colaborador: la vigente efectiva (o `null`) y todas, más nueva primero. */
export interface EmployeeApplicationsDto {
  employeeId: number
  current: ApplicationSummaryDto | null
  history: ApplicationSummaryDto[]
}
