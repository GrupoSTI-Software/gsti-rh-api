import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Contratos B2B de servicios especializados (prestador REPSE ↔ empresa contratante).
 *
 * - Soft delete para conservar expediente fiscal (LFT / SAT 5 años).
 * - UNIQUE filtrado vía columna virtual `contrato_servicio_especializado_is_active`.
 * - Unicidad `numero_contrato` a nivel tenant se refuerza en servicio.
 */
export default class extends BaseSchema {
  protected tableName = 'contratos_servicios_especializados'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('contrato_servicio_especializado_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_cse_business_unit')
        .onDelete('RESTRICT')

      table
        .integer('empresa_contratante_id')
        .unsigned()
        .notNullable()
        .references('empresa_contratante_id')
        .inTable('empresas_contratantes')
        .withKeyName('fk_cse_empresa_contratante')
        .onDelete('RESTRICT')

      table.string('contrato_servicio_especializado_numero_contrato', 50).notNullable()
      table.date('contrato_servicio_especializado_fecha_inicio').notNullable()
      table.date('contrato_servicio_especializado_fecha_fin').nullable()
      table.text('contrato_servicio_especializado_objeto_servicio').notNullable()
      table.decimal('contrato_servicio_especializado_monto_total', 15, 2).nullable()
      table
        .string('contrato_servicio_especializado_moneda', 3)
        .notNullable()
        .defaultTo('MXN')
      table
        .enum('contrato_servicio_especializado_estatus', [
          'borrador',
          'vigente',
          'vencido',
          'cancelado',
        ])
        .notNullable()
        .defaultTo('borrador')

      table
        .timestamp('contrato_servicio_especializado_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('contrato_servicio_especializado_updated_at').nullable()
      table.timestamp('contrato_servicio_especializado_deleted_at').nullable().defaultTo(null)

      table.index(
        ['business_unit_id', 'contrato_servicio_especializado_estatus', 'contrato_servicio_especializado_deleted_at'],
        'idx_cse_business_unit_estatus'
      )
      table.index(
        ['business_unit_id', 'empresa_contratante_id'],
        'idx_cse_business_unit_contratante'
      )
    })

    this.schema.raw(`
      ALTER TABLE \`contratos_servicios_especializados\`
      ADD COLUMN \`contrato_servicio_especializado_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`contrato_servicio_especializado_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`contratos_servicios_especializados\`
      ADD UNIQUE KEY \`cse_business_unit_numero_contrato_active_unique\`
        (\`business_unit_id\`, \`contrato_servicio_especializado_numero_contrato\`, \`contrato_servicio_especializado_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
