import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import WorkJournalSealRunItem from './work_journal_seal_run_item.js'

export type WorkJournalSealRunStatus = 'running' | 'ok' | 'partial' | 'failed'

export interface WorkJournalSealRunSummary {
  cutoffDate: string
  businessUnitsProcessed: number
  businessUnitsWithoutConfig: number
  businessUnitsWithoutConfigNames: string[]
  periodsSealed: number
  periodsSkipped: number
  periodsWithErrors: number
  errors: Array<{
    businessUnitName: string
    periodStart: string
    periodEnd: string
    detail: string
  }>
}

/**
 * Bitácora de cada corrida del job de cierre automático de jornada
 * (USRH1782268640950). Una corrida procesa todas las empresas; el detalle
 * por empresa vive en `WorkJournalSealRunItem`.
 */
export default class WorkJournalSealRun extends BaseModel {
  static readonly table = 'work_journal_seal_runs'

  @column({ isPrimary: true, columnName: 'work_journal_seal_run_id' })
  declare workJournalSealRunId: number

  /** Fecha de corte evaluada por la corrida ("ayer" en zona de negocio, salvo `--date`). */
  @column.dateTime({ columnName: 'work_journal_seal_run_cutoff_date' })
  declare cutoffDate: DateTime

  @column.dateTime({ columnName: 'work_journal_seal_run_started_at' })
  declare startedAt: DateTime

  @column.dateTime({ columnName: 'work_journal_seal_run_finished_at' })
  declare finishedAt: DateTime | null

  @column({ columnName: 'work_journal_seal_run_status' })
  declare status: WorkJournalSealRunStatus

  @column({
    columnName: 'work_journal_seal_run_summary',
    prepare: (value: WorkJournalSealRunSummary | null) => (value === null ? null : JSON.stringify(value)),
    consume: (value: string | WorkJournalSealRunSummary | null) =>
      typeof value === 'string' ? (JSON.parse(value) as WorkJournalSealRunSummary) : value,
  })
  declare summary: WorkJournalSealRunSummary | null

  @column.dateTime({ columnName: 'work_journal_seal_run_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'work_journal_seal_run_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @hasMany(() => WorkJournalSealRunItem, {
    foreignKey: 'workJournalSealRunId',
  })
  declare items: HasMany<typeof WorkJournalSealRunItem>
}
