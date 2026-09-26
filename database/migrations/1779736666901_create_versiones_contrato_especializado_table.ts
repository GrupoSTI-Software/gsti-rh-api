import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Historial inmutable (write-once) de estados superados de contratos de servicios especializados.
 * ON DELETE CASCADE: al eliminar físicamente el contrato, caen sus versiones históricas.
 */
export default class extends BaseSchema {
  protected tableName = 'versiones_contrato_especializado'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('version_contrato_especializado_id').notNullable()

      table
        .integer('contrato_servicio_especializado_id')
        .unsigned()
        .notNullable()
        .references('contrato_servicio_especializado_id')
        .inTable('contratos_servicios_especializados')
        .withKeyName('fk_vce_contrato')
        .onDelete('CASCADE')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_vce_business_unit')
        .onDelete('RESTRICT')

      table.integer('version_contrato_especializado_numero').unsigned().notNullable()

      table
        .enum('version_contrato_especializado_tipo_cambio', ['renovacion', 'addendum'])
        .notNullable()

      table.string('version_contrato_especializado_motivo', 500).notNullable()

      table
        .dateTime('version_contrato_especializado_fecha_cambio')
        .notNullable()

      table.date('version_contrato_especializado_snapshot_fecha_inicio').notNullable()
      table.date('version_contrato_especializado_snapshot_fecha_fin').nullable()

      table.json('version_contrato_especializado_anexo15d_snapshot').notNullable()

      table
        .integer('version_contrato_especializado_documento_vigente_id')
        .unsigned()
        .nullable()
        .references('documento_contrato_especializado_id')
        .inTable('documentos_contrato_especializado')
        .withKeyName('fk_vce_documento_vigente')
        .onDelete('SET NULL')

      table.integer('version_contrato_especializado_creado_por').unsigned().nullable()

      table
        .timestamp('version_contrato_especializado_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('version_contrato_especializado_updated_at').nullable()
      table.timestamp('version_contrato_especializado_deleted_at').nullable().defaultTo(null)

      table.unique(
        ['contrato_servicio_especializado_id', 'version_contrato_especializado_numero'],
        'uq_vce_contrato_numero'
      )

      table.index(
        ['contrato_servicio_especializado_id', 'version_contrato_especializado_numero'],
        'idx_vce_contrato_numero'
      )
      table.index(
        ['business_unit_id', 'contrato_servicio_especializado_id'],
        'idx_vce_business_unit_contrato'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
