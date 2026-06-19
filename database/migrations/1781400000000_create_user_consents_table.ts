import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tabla de aceptaciones de consentimiento legal (T&C y aviso de privacidad).
 *
 * Diseño:
 *  - Una fila por (user_id, document_version): un usuario puede aceptar la
 *    misma versión solo una vez (idempotencia); cuando se libera una versión
 *    nueva, el usuario aún no tiene registro para esa versión.
 *  - Registro inmutable: sin soft delete, sin update; solo INSERT (evidencia
 *    legal defendible ante LFPDPPP).
 *  - La versión vigente se define en consent.constants.ts del backend;
 *    GET /api/consent/me compara contra esa constante para saber si el usuario
 *    ya aceptó la versión actual.
 */
export default class extends BaseSchema {
  protected tableName = 'user_consents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('user_consent_id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')

      table.string('user_consent_document_version', 20).notNullable()

      table.timestamp('user_consent_accepted_at').notNullable()

      table.timestamp('user_consent_created_at').notNullable()
      table.timestamp('user_consent_updated_at').nullable()

      // Unicidad: un registro por usuario por versión (idempotencia)
      table.unique(['user_id', 'user_consent_document_version'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
