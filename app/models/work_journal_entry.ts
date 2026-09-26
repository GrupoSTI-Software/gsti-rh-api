import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeUpdate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Shift from '#models/shift'
import WorkingTimeRule from '#models/working_time_rule'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { WorkJournalEntryError } from '../exceptions/work_journal_entry_error.js'
import { WJE_ERROR_CODES } from '../constants/work_journal_entry_error_codes.js'

export type WorkJournalEntryStatus = 'open' | 'closed'

/**
 * Copia canónica de la jornada de un día que se congela al sellar.
 * No es una referencia viva: se calcula al cierre y no cambia después.
 */
export type WorkJournalSnapshot = {
  employeeId: number
  businessUnitId: number
  date: string
  periodStart: string
  periodEnd: string
  checkIn: string | null
  checkOut: string | null
  workedMinutes: number | null
  dayStatus: string
  shiftId: number | null
  workingTimeRuleId: number | null
}

/**
 * Columnas que quedan congeladas una vez la entrada está cerrada. Cualquier
 * intento de mutarlas en una fila `closed` se rechaza en el hook beforeUpdate.
 * Se permite mutar `deletedAt` (soft delete administrativo).
 */
const SEALED_IMMUTABLE_COLUMNS = [
  'employeeId',
  'businessUnitId',
  'workingTimeRuleId',
  'shiftId',
  'date',
  'periodStart',
  'periodEnd',
  'checkIn',
  'checkOut',
  'workedMinutes',
  'dayStatus',
  'status',
  'closedAt',
  'snapshot',
  'contentHash',
  'hmacKeyVersion',
] as const

/**
 * Registro electrónico de jornada por trabajador y día calendario.
 *
 * Estados: `open` (editable, refleja el cálculo vigente) y `closed`
 * (congelado con snapshot + sello HMAC-SHA-256 e inmutable). El sellado y las
 * consultas nunca cruzan empresas gracias a `withBusinessUnitScope()`.
 */
export default class WorkJournalEntry extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static readonly table = 'work_journal_entries'

  @column({ isPrimary: true, columnName: 'work_journal_entry_id' })
  declare workJournalEntryId: number

  @column({ columnName: 'employee_id' })
  declare employeeId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column({ columnName: 'working_time_rule_id' })
  declare workingTimeRuleId: number | null

  @column({ columnName: 'shift_id' })
  declare shiftId: number | null

  @column.date({ columnName: 'work_journal_entry_date' })
  declare date: DateTime

  @column.date({ columnName: 'work_journal_entry_period_start' })
  declare periodStart: DateTime

  @column.date({ columnName: 'work_journal_entry_period_end' })
  declare periodEnd: DateTime

  @column.dateTime({ columnName: 'work_journal_entry_check_in' })
  declare checkIn: DateTime | null

  @column.dateTime({ columnName: 'work_journal_entry_check_out' })
  declare checkOut: DateTime | null

  @column({ columnName: 'work_journal_entry_worked_minutes' })
  declare workedMinutes: number | null

  @column({ columnName: 'work_journal_entry_day_status' })
  declare dayStatus: string

  @column({ columnName: 'work_journal_entry_status' })
  declare status: WorkJournalEntryStatus

  @column.dateTime({ columnName: 'work_journal_entry_closed_at' })
  declare closedAt: DateTime | null

  @column({
    columnName: 'work_journal_entry_snapshot',
    prepare: (value: WorkJournalSnapshot | null) => (value === null ? null : JSON.stringify(value)),
    consume: (value: string | WorkJournalSnapshot | null) =>
      typeof value === 'string' ? (JSON.parse(value) as WorkJournalSnapshot) : value,
  })
  declare snapshot: WorkJournalSnapshot | null

  @column({ columnName: 'work_journal_entry_content_hash' })
  declare contentHash: string | null

  @column({ columnName: 'work_journal_entry_hmac_key_version' })
  declare hmacKeyVersion: number | null

  @column.dateTime({ columnName: 'work_journal_entry_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'work_journal_entry_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'work_journal_entry_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    localKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => WorkingTimeRule, {
    foreignKey: 'workingTimeRuleId',
    localKey: 'workingTimeRuleId',
  })
  declare workingTimeRule: BelongsTo<typeof WorkingTimeRule>

  @belongsTo(() => Shift, {
    foreignKey: 'shiftId',
    localKey: 'shiftId',
  })
  declare shift: BelongsTo<typeof Shift>

  /**
   * Guardia write-once: una vez que la fila estaba `closed` en base, su
   * contenido sellado no puede modificarse (regla de negocio #6). Solo se
   * tolera el soft delete (mutación de `deletedAt`).
   */
  @beforeUpdate()
  static rejectSealedMutation(entry: WorkJournalEntry) {
    const original = entry.$original as Partial<WorkJournalEntry> | undefined
    if (original?.status !== 'closed') {
      return
    }

    for (const fieldName of SEALED_IMMUTABLE_COLUMNS) {
      const before = original[fieldName]
      const after = entry[fieldName]
      const beforeIso = before instanceof DateTime ? before.toISO() : before
      const afterIso = after instanceof DateTime ? after.toISO() : after
      if (JSON.stringify(beforeIso) !== JSON.stringify(afterIso)) {
        throw new WorkJournalEntryError(
          'Un registro de jornada cerrado no puede modificarse.',
          WJE_ERROR_CODES.IMMUTABLE,
          409,
          'registro-inmutable',
          'Los registros de jornada cerrados son inmutables.'
        )
      }
    }
  }
}
