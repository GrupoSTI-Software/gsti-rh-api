import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca de agua de anuncios de producto por usuario (overlay de bienvenida y tours
 * del Backoffice).
 *
 * Diseño:
 *  - Una fila por usuario (`user_id` único): guarda solo la fecha del último anuncio
 *    que el usuario vio. El contenido de los anuncios vive en el Backoffice, no aquí.
 *  - Tabla personal, sin `business_unit_id` ni mixin de tenant: la marca es del
 *    usuario, no de la empresa (mismo criterio que `user_consents`).
 *  - `user_announcement_state_last_seen_at` es nullable por contrato, aunque el
 *    service solo crea la fila con una fecha (el GET nunca crea fila).
 */
export default class extends BaseSchema {
  protected tableName = 'user_announcement_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('user_announcement_state_id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')

      // Milisegundos: el BO compara esta marca contra la fecha de publicación de cada
      // anuncio; redondear al segundo podría ocultar o repetir un anuncio.
      table.timestamp('user_announcement_state_last_seen_at', { precision: 3 }).nullable()

      table.timestamp('user_announcement_state_created_at').notNullable()
      table.timestamp('user_announcement_state_updated_at').nullable()

      table.unique(['user_id'], { indexName: 'uq_uas_user_id' })
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
