import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Asignaciones de trabajadores a contratos de servicios especializados REPSE.
 * ON DELETE CASCADE: al eliminar físicamente el contrato, caen sus asignaciones.
 */
export default class extends BaseSchema {
  protected tableName = 'asignaciones_contrato_especializado'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('asignacion_contrato_especializado_id').notNullable()

      table
        .integer('contrato_servicio_especializado_id')
        .unsigned()
        .notNullable()
        .references('contrato_servicio_especializado_id')
        .inTable('contratos_servicios_especializados')
        .withKeyName('fk_ace_contrato')
        .onDelete('CASCADE')

      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .withKeyName('fk_ace_employee')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_ace_business_unit')
        .onDelete('RESTRICT')

      table.date('asignacion_contrato_especializado_fecha_inicio').notNullable()
      table.date('asignacion_contrato_especializado_fecha_fin').nullable()

      table
        .decimal('asignacion_contrato_especializado_porcentaje_tiempo', 5, 2)
        .notNullable()
        .defaultTo(100.0)

      table
        .timestamp('asignacion_contrato_especializado_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('asignacion_contrato_especializado_updated_at').nullable()
      table.timestamp('asignacion_contrato_especializado_deleted_at').nullable().defaultTo(null)

      table.index(
        ['contrato_servicio_especializado_id', 'asignacion_contrato_especializado_deleted_at'],
        'idx_ace_contrato_deleted'
      )
      table.index(
        ['employee_id', 'asignacion_contrato_especializado_fecha_inicio'],
        'idx_ace_employee_fecha_inicio'
      )
      table.index(['business_unit_id'], 'idx_ace_business_unit')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
