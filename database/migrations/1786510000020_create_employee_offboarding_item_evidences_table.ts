import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Evidencias adjuntas a un pendiente del expediente de salida
 * (USRH1786568279593). Molde de
 * `1782200000000_create_traumatic_event_report_evidences_table.ts`:
 *  - FK `integer().unsigned()` (las PK del dominio son `increments()`),
 *    declarada suelta y creada aparte con nombre corto (<64 chars de MySQL).
 *  - El archivo se guarda como Key de S3 (UploadService 'private'); nunca se
 *    expone al cliente, solo URLs firmadas temporales.
 *  - Borrado lógico vía `_deleted_at`: quitar la evidencia la saca de la
 *    vista pero el objeto de S3 se conserva (regla 5, D-5).
 *  - Índice compuesto (itemId, deletedAt) para listar y contar vivas.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboarding_item_evidences'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_offboarding_item_evidence_id').notNullable()

      table.integer('employee_offboarding_item_id').unsigned().notNullable()

      table.string('employee_offboarding_item_evidence_file', 2048).notNullable()
      table.string('employee_offboarding_item_evidence_original_name', 255).nullable()

      table.timestamp('employee_offboarding_item_evidence_created_at').notNullable()
      table.timestamp('employee_offboarding_item_evidence_updated_at').nullable()
      table.timestamp('employee_offboarding_item_evidence_deleted_at').nullable()

      table
        .foreign('employee_offboarding_item_id', 'fk_eoi_evid_item')
        .references('employee_offboarding_item_id')
        .inTable('employee_offboarding_items')
        .onDelete('CASCADE')

      table.index(
        ['employee_offboarding_item_id', 'employee_offboarding_item_evidence_deleted_at'],
        'idx_eoi_evid_item_active'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
