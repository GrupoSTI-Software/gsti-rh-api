import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora inmutable de transiciones de estatus del buzón de quejas (NOM-035).
 *
 * Convenciones del repo aplicadas:
 *  - Tabla plural `complaint_status_histories`; columnas con prefijo
 *    `complaint_status_history_`.
 *  - Solo `created_at` (sin `updated_at` ni soft delete): registro append-only.
 *  - `complaint_status_history_from_status` nullable para el primer movimiento
 *    registrado al crear el caso (de null → nuevo).
 *  - `actor_user_id` identifica al administrador que realizó la transición.
 */
export default class extends BaseSchema {
  protected tableName = 'complaint_status_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_status_history_id').notNullable()

      table.integer('complaint_id').unsigned().notNullable()
      table.integer('actor_user_id').unsigned().notNullable()

      table
        .enum('complaint_status_history_from_status', [
          'nuevo',
          'en-revision',
          'resuelto',
          'cerrado',
        ])
        .nullable()

      table
        .enum('complaint_status_history_to_status', [
          'nuevo',
          'en-revision',
          'resuelto',
          'cerrado',
        ])
        .notNullable()

      table.text('complaint_status_history_note').notNullable()

      table.timestamp('complaint_status_history_created_at').notNullable()

      table
        .foreign('complaint_id', 'fk_complaint_status_history_complaint')
        .references('complaint_id')
        .inTable('complaints')
        .onDelete('CASCADE')

      table
        .foreign('actor_user_id', 'fk_complaint_status_history_actor_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(
        ['complaint_id', 'complaint_status_history_created_at'],
        'idx_complaint_status_history_timeline'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
