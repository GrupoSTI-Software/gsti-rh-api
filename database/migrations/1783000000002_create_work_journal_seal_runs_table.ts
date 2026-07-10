import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de cada corrida del job de cierre automático (USRH1782268640950).
 *
 * No es multi-tenant por sí misma (una corrida procesa TODAS las empresas);
 * el aislamiento por empresa vive en `work_journal_seal_run_items`.
 */
export default class extends BaseSchema {
  protected tableName = 'work_journal_seal_runs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('work_journal_seal_run_id').notNullable()

      table.dateTime('work_journal_seal_run_cutoff_date').notNullable()
      table.dateTime('work_journal_seal_run_started_at').notNullable()
      table.dateTime('work_journal_seal_run_finished_at').nullable()

      table
        .enum('work_journal_seal_run_status', ['running', 'ok', 'partial', 'failed'])
        .notNullable()
        .defaultTo('running')

      // Conteos + detalle de errores/omisiones de la corrida (regla de negocio #8).
      table.json('work_journal_seal_run_summary').nullable()

      table.timestamp('work_journal_seal_run_created_at').notNullable()
      table.timestamp('work_journal_seal_run_updated_at').nullable()

      table.index(['work_journal_seal_run_status'], 'idx_wjsr_status')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
