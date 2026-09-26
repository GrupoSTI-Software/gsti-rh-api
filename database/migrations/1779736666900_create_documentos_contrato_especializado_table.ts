import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Documentos firmados del contrato de servicios especializados (1:N, histórico archivado).
 * ON DELETE CASCADE: al eliminar físicamente el contrato, caen sus documentos.
 */
export default class extends BaseSchema {
  protected tableName = 'documentos_contrato_especializado'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('documento_contrato_especializado_id').notNullable()

      table
        .integer('contrato_servicio_especializado_id')
        .unsigned()
        .notNullable()
        .references('contrato_servicio_especializado_id')
        .inTable('contratos_servicios_especializados')
        .withKeyName('fk_dce_contrato')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_dce_business_unit')
        .onDelete('RESTRICT')

      table
        .enum('documento_contrato_especializado_origen', ['subido', 'firmado_canvas'])
        .notNullable()
        .defaultTo('subido')

      table.boolean('documento_contrato_especializado_vigente').notNullable().defaultTo(true)

      table.date('documento_contrato_especializado_fecha_inicio_vigencia').notNullable()
      table.date('documento_contrato_especializado_fecha_vencimiento').notNullable()

      table.string('documento_contrato_especializado_nombre_archivo', 255).notNullable()
      table.string('documento_contrato_especializado_storage_key', 512).notNullable()
      table.string('documento_contrato_especializado_mime_type', 100).notNullable()
      table.integer('documento_contrato_especializado_tamano_bytes').unsigned().notNullable()

      table.integer('documento_contrato_especializado_subido_por').unsigned().nullable()

      table
        .timestamp('documento_contrato_especializado_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('documento_contrato_especializado_updated_at').nullable()
      table.timestamp('documento_contrato_especializado_deleted_at').nullable().defaultTo(null)

      table.index(
        [
          'contrato_servicio_especializado_id',
          'documento_contrato_especializado_vigente',
          'documento_contrato_especializado_deleted_at',
        ],
        'idx_dce_contrato_vigente'
      )
      table.index(
        ['business_unit_id', 'contrato_servicio_especializado_id'],
        'idx_dce_business_unit_contrato'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
