import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adjuntos de evidencia del buzón de quejas confidencial (NOM-035 8.1.b).
 *
 * Convenciones del repo aplicadas:
 *  - Columnas con prefijo `complaint_attachment_`.
 *  - `complaint_id` es la única FK hacia `complaints`; CASCADE en hard-delete
 *    de la queja (la aplicación usa soft-delete, esto cubre red de seguridad).
 *  - `complaint_attachment_file_path` almacena la Key de S3 (privada); no se
 *    expone al cliente, solo URLs firmadas.
 *  - `complaint_attachment_sanitized` confirma que el archivo persistido ya no
 *    conserva metadatos identificantes (EXIF, PDF, ID3).
 *  - Soft delete via columna `complaint_attachment_deleted_at`.
 */
export default class extends BaseSchema {
  protected tableName = 'complaint_attachments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_attachment_id').notNullable()

      table.integer('complaint_id').unsigned().notNullable()

      table.string('complaint_attachment_file_name', 255).notNullable()
      table.string('complaint_attachment_file_path', 2048).notNullable()
      table.string('complaint_attachment_mime_type', 100).notNullable()
      table.integer('complaint_attachment_file_size').unsigned().notNullable()

      table.boolean('complaint_attachment_sanitized').notNullable().defaultTo(true)

      table.timestamp('complaint_attachment_created_at').notNullable()
      table.timestamp('complaint_attachment_updated_at').notNullable()
      table.timestamp('complaint_attachment_deleted_at').nullable()

      table
        .foreign('complaint_id', 'fk_complaint_attachment_complaint')
        .references('complaint_id')
        .inTable('complaints')
        .onDelete('CASCADE')

      table.index(
        ['complaint_id', 'complaint_attachment_deleted_at'],
        'idx_complaint_attachment_active'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
