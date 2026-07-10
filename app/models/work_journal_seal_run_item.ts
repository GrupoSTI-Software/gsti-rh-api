import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from './business_unit.js'
import WorkJournalSealRun from './work_journal_seal_run.js'

export type WorkJournalSealRunItemResult = 'sealed' | 'skipped' | 'no_config' | 'error'

/**
 * Detalle por empresa/periodo de una corrida del job de cierre. Es la
 * fuente que permite el reintento (regla de negocio #6): la corrida
 * siguiente busca items `error` sin un item posterior `sealed`/`skipped`
 * para el mismo `(business_unit_id, period_start, period_end)`.
 */
export default class WorkJournalSealRunItem extends BaseModel {
  static readonly table = 'work_journal_seal_run_items'

  @column({ isPrimary: true, columnName: 'work_journal_seal_run_item_id' })
  declare workJournalSealRunItemId: number

  @column({ columnName: 'work_journal_seal_run_id' })
  declare workJournalSealRunId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column.date({ columnName: 'work_journal_seal_run_item_period_start' })
  declare periodStart: DateTime

  @column.date({ columnName: 'work_journal_seal_run_item_period_end' })
  declare periodEnd: DateTime

  @column({ columnName: 'work_journal_seal_run_item_result' })
  declare result: WorkJournalSealRunItemResult

  @column({ columnName: 'work_journal_seal_run_item_detail' })
  declare detail: string | null

  @column.dateTime({ columnName: 'work_journal_seal_run_item_created_at', autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => WorkJournalSealRun, {
    foreignKey: 'workJournalSealRunId',
    localKey: 'workJournalSealRunId',
  })
  declare run: BelongsTo<typeof WorkJournalSealRun>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
