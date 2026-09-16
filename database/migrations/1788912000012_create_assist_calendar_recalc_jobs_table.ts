import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cola de recalculo de calendarios (spec v2, 5.4). El checador espera un acuse
 * en segundos y el recalculo de un colaborador puede tardar mucho mas: sale de
 * la peticion y lo consume `adms:recalc-calendars`.
 */
export default class extends BaseSchema {
  protected tableName = 'assist_calendar_recalc_jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('assist_calendar_recalc_job_id').notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.date('assist_calendar_recalc_job_from').notNullable()
      table.date('assist_calendar_recalc_job_to').notNullable()
      table
        .enum('assist_calendar_recalc_job_status', ['pending', 'done', 'failed'])
        .notNullable()
        .defaultTo('pending')
      table.integer('assist_calendar_recalc_job_attempts').unsigned().notNullable().defaultTo(0)
      table.text('assist_calendar_recalc_job_error').nullable()
      table.timestamp('assist_calendar_recalc_job_done_at').nullable()

      table.timestamp('assist_calendar_recalc_job_created_at').notNullable().defaultTo(this.now())
      table.timestamp('assist_calendar_recalc_job_updated_at').nullable()

      table.index(
        ['assist_calendar_recalc_job_status', 'assist_calendar_recalc_job_created_at'],
        'idx_assist_calendar_recalc_status_created'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
