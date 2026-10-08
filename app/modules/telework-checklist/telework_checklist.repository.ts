import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type TeleworkChecklistItem from '#models/telework_checklist_item'
import type { EmployeeWorkSchedule } from '#constants/employee_work_schedule'
import type {
  TeleworkChecklistAnswerResult,
  TeleworkChecklistApplicationStatus,
  TeleworkChecklistInvalidationReason,
  TeleworkChecklistMode,
  TeleworkChecklistOverallResult,
} from '#constants/telework_checklist'

/**
 * Puerto del repositorio de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870).
 *
 * El adaptador MySQL filtra `business_unit_id` explícito en cada consulta (con
 * `db.from(...)`, sin modelos ni mixin) para servir fuera de HTTP — el cron de
 * VLRH-H1791306081115 consume `getCurrentByEmployee`. Las filas viajan como
 * registros camelCase con `appliedAt`/`expiresAt` ya como `yyyy-MM-dd`;
 * el estado que expone el registro es el **persistido** (la vigencia efectiva la
 * calcula el servicio con `effectiveStatus`).
 */

/** Fila de aplicación mapeada a camelCase (estado persistido, fechas de calendario). */
export interface TeleworkChecklistApplicationRecord {
  applicationId: number
  businessUnitId: number
  employeeId: number
  teleworkLocationId: number | null
  mode: TeleworkChecklistMode
  status: TeleworkChecklistApplicationStatus
  overallResult: TeleworkChecklistOverallResult
  appliedAt: string
  revalidationPeriodMonths: number
  expiresAt: string
  inspectorName: string | null
  notes: string | null
  appliedByUserId: number
  invalidatedAt: string | null
  invalidationReason: TeleworkChecklistInvalidationReason | null
}

/** Respuesta leída junto con su punto (código y `labelKey` para i18n). */
export interface TeleworkChecklistAnswerRecord {
  itemId: number
  code: string
  labelKey: string
  result: TeleworkChecklistAnswerResult
  observation: string | null
}

/** Valores del INSERT de una aplicación nueva (estado siempre `vigente`). */
export interface TeleworkChecklistApplicationInsert {
  businessUnitId: number
  employeeId: number
  teleworkLocationId: number | null
  mode: TeleworkChecklistMode
  overallResult: TeleworkChecklistOverallResult
  appliedAt: string
  revalidationPeriodMonths: number
  expiresAt: string
  inspectorName: string | null
  notes: string | null
  appliedByUserId: number
}

/** Respuesta del INSERT en lote (el `business_unit_id` del padre lo pone el adaptador). */
export interface TeleworkChecklistAnswerInsert {
  itemId: number
  result: TeleworkChecklistAnswerResult
  observation: string | null
}

/** Datos extra de una transición de estado (`invalidada`); `updated_at` siempre se toca. */
export interface TeleworkChecklistStatusExtra {
  invalidatedAt?: string
  invalidationReason?: TeleworkChecklistInvalidationReason
  invalidatedByUserId?: number
}

export interface TeleworkChecklistRepository {
  /** Puntos activos del catálogo global, en su orden de presentación. */
  listActiveItems(): Promise<TeleworkChecklistItem[]>

  /** Modalidad del colaborador vivo en la empresa; `null` si no existe en ella. */
  findEmployeeWorkSchedule(
    businessUnitId: number,
    employeeId: number
  ): Promise<EmployeeWorkSchedule | null>

  /** ¿Existe un lugar vivo del propio colaborador en la empresa? */
  hasLiveTeleworkLocation(
    businessUnitId: number,
    employeeId: number,
    locationId: number
  ): Promise<boolean>

  /** Aplicaciones del colaborador, más nueva primero (`applied_at`, luego `id`). */
  listByEmployee(
    businessUnitId: number,
    employeeId: number
  ): Promise<TeleworkChecklistApplicationRecord[]>

  /** La aplicación persistida en `vigente` del colaborador (con `forUpdate` cuando llega `trx`). */
  findCurrentPersisted(
    businessUnitId: number,
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<TeleworkChecklistApplicationRecord | null>

  /** Aplicación por id dentro de la empresa; `null` si es ajena o inexistente. */
  findApplication(
    businessUnitId: number,
    applicationId: number
  ): Promise<TeleworkChecklistApplicationRecord | null>

  /** Respuestas de una aplicación con el código y `labelKey` de su punto. */
  listAnswersWithItems(
    businessUnitId: number,
    applicationId: number
  ): Promise<TeleworkChecklistAnswerRecord[]>

  /** Toma `forUpdate` sobre la fila del colaborador (serializa la carrera de registro). */
  lockEmployeeRow(
    businessUnitId: number,
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<void>

  /** Inserta la aplicación y devuelve su id generado. */
  insertApplication(values: TeleworkChecklistApplicationInsert, trx: TransactionClientContract): Promise<number>

  /** Inserta en lote las respuestas de una aplicación. */
  insertAnswers(
    applicationId: number,
    businessUnitId: number,
    answers: TeleworkChecklistAnswerInsert[],
    trx: TransactionClientContract
  ): Promise<void>

  /** Cambia el estado de una aplicación (y sus datos de invalidación); siempre toca `updated_at`. */
  updateApplicationStatus(
    applicationId: number,
    status: TeleworkChecklistApplicationStatus,
    extra?: TeleworkChecklistStatusExtra,
    trx?: TransactionClientContract
  ): Promise<void>
}
