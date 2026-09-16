import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Rediseño del buzón de avisos (Avisos y noticias v2).
 *
 * Tres columnas nuevas, todas con valor seguro para las filas existentes:
 *
 * - `notice_audience`: cómo se armó la lista de destinatarios (toda la
 *   empresa, por departamento o selección manual). Los avisos previos se
 *   construyeron eligiendo colaboradores uno por uno, así que nacen `manual`.
 * - `notice_scheduled_at`: hora a la que el comando programado debe enviar el
 *   aviso. NULL en los enviados y en los borradores; el estado se deriva de
 *   esta columna y de `notice_sent_at`, no se guarda aparte.
 * - `notice_created_by_user_id`: quién redactó el aviso. Nullable porque los
 *   avisos anteriores no lo registraban y el usuario puede borrarse.
 */
export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('notice_audience', ['company', 'department', 'manual'])
        .notNullable()
        .defaultTo('manual')
        .after('notice_type')
      table.timestamp('notice_scheduled_at').nullable().after('notice_sent_at')
      table
        .integer('notice_created_by_user_id')
        .unsigned()
        .nullable()
        .after('notice_scheduled_at')
      table
        .foreign('notice_created_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')
      table.index(['notice_scheduled_at', 'notice_sent_at'], 'notices_scheduled_pending_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['notice_scheduled_at', 'notice_sent_at'], 'notices_scheduled_pending_idx')
      table.dropForeign(['notice_created_by_user_id'])
      table.dropColumn('notice_created_by_user_id')
      table.dropColumn('notice_scheduled_at')
      table.dropColumn('notice_audience')
    })
  }
}
