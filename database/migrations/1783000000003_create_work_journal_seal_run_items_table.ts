import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Detalle por empresa/periodo de cada corrida del job de cierre (§9 del
 * spec USRH1782268640950). No es solo auditoría: es la fuente que permite
 * el reintento (regla de negocio #6) — la corrida siguiente busca items con
 * `result = 'error'` que aún no tengan un item posterior exitoso para el
 * mismo (business_unit_id, period_start, period_end).
 */
export default class extends BaseSchema {
  protected tableName = 'work_journal_seal_run_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('work_journal_seal_run_item_id').notNullable()

      table.bigInteger('work_journal_seal_run_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table.date('work_journal_seal_run_item_period_start').notNullable()
      table.date('work_journal_seal_run_item_period_end').notNullable()

      table
        .enum('work_journal_seal_run_item_result', ['sealed', 'skipped', 'no_config', 'error'])
        .notNullable()
      table.text('work_journal_seal_run_item_detail').nullable()

      table.timestamp('work_journal_seal_run_item_created_at').notNullable()

      table
        .foreign('work_journal_seal_run_id', 'fk_wjsri_run')
        .references('work_journal_seal_runs.work_journal_seal_run_id')
        .onDelete('CASCADE')
      table
        .foreign('business_unit_id', 'fk_wjsri_business_unit')
        .references('business_units.business_unit_id')

      table.index(
        ['business_unit_id', 'work_journal_seal_run_item_result'],
        'idx_wjsri_bu_result'
      )
      table.index(
        ['business_unit_id', 'work_journal_seal_run_item_period_start', 'work_journal_seal_run_item_period_end'],
        'idx_wjsri_bu_period'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
