import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import TeleworkChecklistItem from '#models/telework_checklist_item'
import type { EmployeeWorkSchedule } from '#constants/employee_work_schedule'
import type {
  TeleworkChecklistAnswerResult,
  TeleworkChecklistApplicationStatus,
  TeleworkChecklistInvalidationReason,
  TeleworkChecklistMode,
  TeleworkChecklistOverallResult,
} from '#constants/telework_checklist'
import type {
  TeleworkChecklistAnswerInsert,
  TeleworkChecklistAnswerRecord,
  TeleworkChecklistApplicationInsert,
  TeleworkChecklistApplicationRecord,
  TeleworkChecklistRepository,
  TeleworkChecklistStatusExtra,
} from './telework_checklist.repository.js'

const APPLICATIONS_TABLE = 'telework_checklist_applications'
const ANSWERS_TABLE = 'telework_checklist_answers'
const ITEMS_TABLE = 'telework_checklist_items'

/** Fila cruda de `telework_checklist_applications`. */
interface RawApplicationRow {
  telework_checklist_application_id: number
  business_unit_id: number
  employee_id: number
  employee_telework_location_id: number | null
  telework_checklist_application_mode: TeleworkChecklistMode
  telework_checklist_application_status: TeleworkChecklistApplicationStatus
  telework_checklist_application_overall_result: TeleworkChecklistOverallResult
  telework_checklist_application_applied_at: string | Date
  telework_checklist_application_revalidation_period_months: number
  telework_checklist_application_expires_at: string | Date
  telework_checklist_application_inspector_name: string | null
  telework_checklist_application_notes: string | null
  telework_checklist_application_applied_by_user_id: number
  telework_checklist_application_invalidated_at: string | Date | null
  telework_checklist_application_invalidation_reason: TeleworkChecklistInvalidationReason | null
}

/** Fila cruda del join respuestas × puntos (columnas ya aliasadas). */
interface RawAnswerItemRow {
  item_id: number
  code: string
  label_key: string
  result: TeleworkChecklistAnswerResult
  observation: string | null
}

/**
 * Columna de BD `date`/`datetime` como `yyyy-MM-dd`.
 *
 * El driver arma las columnas `date` como `Date` a medianoche de la zona del
 * servidor: se leen en esa misma zona para no correrlas un día.
 */
function toIsoDay(value: unknown): string {
  if (value instanceof Date) return DateTime.fromJSDate(value).toISODate() ?? ''
  if (DateTime.isDateTime(value)) return value.toISODate() ?? ''
  return String(value ?? '').slice(0, 10)
}

/** Timestamp de BD como ISO 8601, o `null`. */
function toIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(String(value)).toISOString()
}

/**
 * Adaptador MySQL del puerto de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870).
 *
 * Todas las lecturas/escrituras de las tablas con `business_unit_id` usan
 * `db.from(...)` con el filtro explícito por empresa (nunca el mixin): así
 * funciona fuera de HTTP, sin `TenantContext`, para el cron de
 * VLRH-H1791306081115. La única excepción es el catálogo global de puntos
 * (`telework_checklist_items`), que no tiene `business_unit_id` ni mixin y se
 * lee por su modelo sin riesgo de contexto. Las filas crudas se mapean a
 * registros camelCase; `appliedAt`/`expiresAt` viajan como `yyyy-MM-dd` y
 * `invalidatedAt` como ISO.
 */
export default class TeleworkChecklistRepositoryMysql implements TeleworkChecklistRepository {
  async listActiveItems(): Promise<TeleworkChecklistItem[]> {
    return TeleworkChecklistItem.query()
      .where('telework_checklist_item_is_active', true)
      .orderBy('telework_checklist_item_order', 'asc')
  }

  async findEmployeeWorkSchedule(
    businessUnitId: number,
    employeeId: number
  ): Promise<EmployeeWorkSchedule | null> {
    const row = (await db
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .select('employee_work_schedule')
      .first()) as { employee_work_schedule: EmployeeWorkSchedule | null } | null

    return row?.employee_work_schedule ?? null
  }

  async hasLiveTeleworkLocation(
    businessUnitId: number,
    employeeId: number,
    locationId: number
  ): Promise<boolean> {
    const row = await db
      .from('employee_telework_locations')
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .where('employee_telework_location_id', locationId)
      .where('employee_telework_location_active', true)
      .whereNull('employee_telework_location_deleted_at')
      .select('employee_telework_location_id')
      .first()

    return Boolean(row)
  }

  async listByEmployee(
    businessUnitId: number,
    employeeId: number
  ): Promise<TeleworkChecklistApplicationRecord[]> {
    const rows = (await db
      .from(APPLICATIONS_TABLE)
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .orderBy('telework_checklist_application_applied_at', 'desc')
      .orderBy('telework_checklist_application_id', 'desc')) as RawApplicationRow[]

    return rows.map((row) => this.toApplicationRecord(row))
  }

  async findCurrentPersisted(
    businessUnitId: number,
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<TeleworkChecklistApplicationRecord | null> {
    const client = trx ?? db
    const row = (await client
      .from(APPLICATIONS_TABLE)
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .where('telework_checklist_application_status', 'vigente')
      .orderBy('telework_checklist_application_applied_at', 'desc')
      .orderBy('telework_checklist_application_id', 'desc')
      .first()) as RawApplicationRow | null

    return row ? this.toApplicationRecord(row) : null
  }

  async findApplication(
    businessUnitId: number,
    applicationId: number
  ): Promise<TeleworkChecklistApplicationRecord | null> {
    const row = (await db
      .from(APPLICATIONS_TABLE)
      .where('business_unit_id', businessUnitId)
      .where('telework_checklist_application_id', applicationId)
      .first()) as RawApplicationRow | null

    return row ? this.toApplicationRecord(row) : null
  }

  async listAnswersWithItems(
    businessUnitId: number,
    applicationId: number
  ): Promise<TeleworkChecklistAnswerRecord[]> {
    const rows = (await db
      .from(`${ANSWERS_TABLE} as a`)
      .join(`${ITEMS_TABLE} as i`, 'i.telework_checklist_item_id', 'a.telework_checklist_item_id')
      .where('a.business_unit_id', businessUnitId)
      .where('a.telework_checklist_application_id', applicationId)
      .orderBy('i.telework_checklist_item_order', 'asc')
      .select(
        'a.telework_checklist_item_id as item_id',
        'i.telework_checklist_item_code as code',
        'i.telework_checklist_item_label_key as label_key',
        'a.telework_checklist_answer_result as result',
        'a.telework_checklist_answer_observation as observation'
      )) as RawAnswerItemRow[]

    return rows.map((row) => ({
      itemId: Number(row.item_id),
      code: row.code,
      labelKey: row.label_key,
      result: row.result,
      observation: row.observation,
    }))
  }

  async lockEmployeeRow(
    businessUnitId: number,
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    await trx
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .forUpdate()
      .first()
  }

  async insertApplication(
    values: TeleworkChecklistApplicationInsert,
    trx: TransactionClientContract
  ): Promise<number> {
    const inserted = await trx.table(APPLICATIONS_TABLE).insert({
      business_unit_id: values.businessUnitId,
      employee_id: values.employeeId,
      employee_telework_location_id: values.teleworkLocationId,
      telework_checklist_application_mode: values.mode,
      telework_checklist_application_status: 'vigente',
      telework_checklist_application_overall_result: values.overallResult,
      telework_checklist_application_applied_at: values.appliedAt,
      telework_checklist_application_revalidation_period_months: values.revalidationPeriodMonths,
      telework_checklist_application_expires_at: values.expiresAt,
      telework_checklist_application_inspector_name: values.inspectorName,
      telework_checklist_application_notes: values.notes,
      telework_checklist_application_applied_by_user_id: values.appliedByUserId,
      telework_checklist_application_created_at: new Date(),
    })

    return Number(inserted[0])
  }

  async insertAnswers(
    applicationId: number,
    businessUnitId: number,
    answers: TeleworkChecklistAnswerInsert[],
    trx: TransactionClientContract
  ): Promise<void> {
    if (answers.length === 0) return

    const now = new Date()
    await trx.table(ANSWERS_TABLE).insert(
      answers.map((answer) => ({
        telework_checklist_application_id: applicationId,
        telework_checklist_item_id: answer.itemId,
        business_unit_id: businessUnitId,
        telework_checklist_answer_result: answer.result,
        telework_checklist_answer_observation: answer.observation,
        telework_checklist_answer_created_at: now,
      }))
    )
  }

  async updateApplicationStatus(
    businessUnitId: number,
    applicationId: number,
    status: TeleworkChecklistApplicationStatus,
    extra?: TeleworkChecklistStatusExtra,
    trx?: TransactionClientContract
  ): Promise<void> {
    const client = trx ?? db
    const values: Record<string, unknown> = {
      telework_checklist_application_status: status,
      telework_checklist_application_updated_at: new Date(),
    }

    if (extra?.invalidatedAt !== undefined) {
      values.telework_checklist_application_invalidated_at = extra.invalidatedAt
    }
    if (extra?.invalidationReason !== undefined) {
      values.telework_checklist_application_invalidation_reason = extra.invalidationReason
    }
    if (extra?.invalidatedByUserId !== undefined) {
      values.telework_checklist_application_invalidated_by_user_id = extra.invalidatedByUserId
    }

    await client
      .from(APPLICATIONS_TABLE)
      .where('business_unit_id', businessUnitId)
      .where('telework_checklist_application_id', applicationId)
      .update(values)
  }

  /** Mapea la fila cruda al registro camelCase del puerto. */
  private toApplicationRecord(row: RawApplicationRow): TeleworkChecklistApplicationRecord {
    return {
      applicationId: Number(row.telework_checklist_application_id),
      businessUnitId: Number(row.business_unit_id),
      employeeId: Number(row.employee_id),
      teleworkLocationId:
        row.employee_telework_location_id === null
          ? null
          : Number(row.employee_telework_location_id),
      mode: row.telework_checklist_application_mode,
      status: row.telework_checklist_application_status,
      overallResult: row.telework_checklist_application_overall_result,
      appliedAt: toIsoDay(row.telework_checklist_application_applied_at),
      revalidationPeriodMonths: Number(
        row.telework_checklist_application_revalidation_period_months
      ),
      expiresAt: toIsoDay(row.telework_checklist_application_expires_at),
      inspectorName: row.telework_checklist_application_inspector_name,
      notes: row.telework_checklist_application_notes,
      appliedByUserId: Number(row.telework_checklist_application_applied_by_user_id),
      invalidatedAt: toIsoTimestamp(row.telework_checklist_application_invalidated_at),
      invalidationReason: row.telework_checklist_application_invalidation_reason,
    }
  }
}
