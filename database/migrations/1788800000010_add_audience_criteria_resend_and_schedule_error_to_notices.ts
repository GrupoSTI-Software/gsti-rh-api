import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Avisos y noticias v2, segunda entrega: alcance como criterio, reenvío y
 * error del envío programado. Cuatro columnas nuevas, todas nulas para las
 * filas existentes:
 *
 * - `notice_department_id` / `notice_position_id`: criterio con el que se armó
 *   el público `department`. Con él, el envío programado vuelve a resolver los
 *   destinatarios al momento de enviar y el compositor reabre el aviso con el
 *   mismo filtro. NULL para `company` y `manual`. Sin FK a propósito: un
 *   departamento o puesto dado de baja no debe impedir conservar el aviso.
 * - `notice_last_resent_at`: último reenvío (completo o solo a quien no lo ha
 *   abierto) de un aviso ya enviado. `notice_sent_at` conserva el envío
 *   original.
 * - `notice_schedule_error`: por qué falló el último envío programado. Se
 *   guarda al degradar el aviso a borrador y se limpia al reprogramarlo o al
 *   enviarlo con éxito.
 *
 * Sin `await` sobre `this.schema`: regla del repo (ver CLAUDE.md).
 */
export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('notice_department_id').unsigned().nullable().after('notice_audience')
      table.integer('notice_position_id').unsigned().nullable().after('notice_department_id')
      table.dateTime('notice_last_resent_at').nullable().after('notice_scheduled_at')
      table.text('notice_schedule_error').nullable().after('notice_last_resent_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notice_schedule_error')
      table.dropColumn('notice_last_resent_at')
      table.dropColumn('notice_position_id')
      table.dropColumn('notice_department_id')
    })
  }
}
