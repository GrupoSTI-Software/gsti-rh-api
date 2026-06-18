import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pivote N:M entre contratos de servicios especializados y el catálogo REPSE.
 *
 * - Sin `tenant_id`: el aislamiento se valida en el caso de uso vía FKs a padres.
 * - UNIQUE compuesto evita duplicar el mismo servicio en un contrato.
 * - Índice por `repse_specialized_service_id` acelera el guard 409 en DELETE del catálogo.
 */
export default class extends BaseSchema {
  protected tableName = 'contrato_servicio_repse'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('contrato_servicio_repse_id').notNullable()

      table
        .integer('contrato_servicio_especializado_id')
        .unsigned()
        .notNullable()
        .references('contrato_servicio_especializado_id')
        .inTable('contratos_servicios_especializados')
        .withKeyName('fk_csr_contrato')
        .onDelete('RESTRICT')

      table
        .integer('repse_specialized_service_id')
        .unsigned()
        .notNullable()
        .references('repse_specialized_service_id')
        .inTable('repse_specialized_services')
        .withKeyName('fk_csr_repse_service')
        .onDelete('RESTRICT')

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()

      table.unique(
        ['contrato_servicio_especializado_id', 'repse_specialized_service_id'],
        'uq_contrato_servicio_repse_contrato_servicio'
      )

      table.index(
        ['repse_specialized_service_id'],
        'idx_contrato_servicio_repse_repse_service'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
