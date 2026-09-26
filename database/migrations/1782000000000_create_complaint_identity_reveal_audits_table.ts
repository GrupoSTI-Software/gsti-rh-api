import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora inmutable de revelaciones de identidad del buzón de quejas (NOM-035).
 *
 * Registra quién des-anonimizó un caso, cuándo y con qué justificación.
 * Es el único camino legítimo y auditado para conocer al denunciante.
 *
 * Convenciones del repo aplicadas:
 *  - Tabla plural `complaint_identity_reveal_audits`; columnas con prefijo
 *    `complaint_identity_reveal_audit_`.
 *  - `revealed_by_user_id` identifica al usuario con permiso `complaint.reveal_identity`.
 */
export default class extends BaseSchema {
  protected tableName = 'complaint_identity_reveal_audits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_identity_reveal_audit_id').notNullable()

      table.integer('complaint_id').unsigned().notNullable()
      table.integer('revealed_by_user_id').unsigned().notNullable()

      table.text('complaint_identity_reveal_audit_justification').notNullable()

      table.timestamp('complaint_identity_reveal_audit_created_at').notNullable()
      table.timestamp('complaint_identity_reveal_audit_updated_at').nullable()
      table.timestamp('complaint_identity_reveal_audit_deleted_at').nullable()

      table
        .foreign('complaint_id', 'fk_complaint_reveal_audit_complaint')
        .references('complaint_id')
        .inTable('complaints')
        .onDelete('CASCADE')

      table
        .foreign('revealed_by_user_id', 'fk_complaint_reveal_audit_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['complaint_id'], 'idx_complaint_reveal_audit_complaint')
      table.index(
        ['complaint_id', 'complaint_identity_reveal_audit_created_at'],
        'idx_complaint_reveal_audit_timeline'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
