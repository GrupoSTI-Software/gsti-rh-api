import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reclamo de los trabajos de recalculo de calendario.
 *
 * La cola se consumia leyendo los `pending`, procesandolos y marcandolos `done`
 * al final, sin reclamarlos en medio. El comando esta pensado para correr cada
 * minuto y una corrida con cincuenta trabajos pesados puede tardar mas: dos
 * corridas solapadas leian los MISMOS pendientes y recalculaban a la vez sobre
 * las mismas filas de calendario. El comentario del propio servicio decia "no
 * debe encimarse consigo mismo" y el tope por corrida no lo garantizaba.
 *
 * `processing` mas `claimed_by` cierran esa ventana: cada corrida marca lo suyo
 * con su propio identificador en una sola sentencia, y despues lee unicamente lo
 * que lleva su marca.
 *
 * `claimed_at` es para recuperar lo que quede colgado si el proceso muere a
 * medias: sin ella, un trabajo en `processing` se quedaria ahi para siempre y
 * ese calendario nunca se recalcularia.
 */
export default class extends BaseSchema {
  protected tableName = 'assist_calendar_recalc_jobs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('assist_calendar_recalc_job_status', ['pending', 'processing', 'done', 'failed'])
        .notNullable()
        .defaultTo('pending')
        .alter()
      table
        .string('assist_calendar_recalc_job_claimed_by', 36)
        .nullable()
        .after('assist_calendar_recalc_job_status')
      table
        .dateTime('assist_calendar_recalc_job_claimed_at')
        .nullable()
        .after('assist_calendar_recalc_job_claimed_by')
      table.index(
        ['assist_calendar_recalc_job_claimed_by'],
        'idx_assist_calendar_recalc_claimed_by'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['assist_calendar_recalc_job_claimed_by'],
        'idx_assist_calendar_recalc_claimed_by'
      )
      table.dropColumn('assist_calendar_recalc_job_claimed_at')
      table.dropColumn('assist_calendar_recalc_job_claimed_by')
      table
        .enum('assist_calendar_recalc_job_status', ['pending', 'done', 'failed'])
        .notNullable()
        .defaultTo('pending')
        .alter()
    })
  }
}
