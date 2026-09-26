import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de empresas contratantes (clientes corporativos del prestador REPSE).
 *
 * - Soft delete para conservar expediente fiscal (LFT / REPSE).
 * - UNIQUE filtrado vía columna virtual `empresa_contratante_is_active`
 *   (mismo patrón que `repse_registrations`).
 * - Unicidad RFC a nivel tenant se refuerza en servicio (`assertRfcUniqueInTenant`).
 */
export default class extends BaseSchema {
  protected tableName = 'empresas_contratantes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('empresa_contratante_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('empresa_contratante_razon_social', 255).notNullable()
      table.string('empresa_contratante_rfc', 13).notNullable()
      table.string('empresa_contratante_domicilio_fiscal', 500).notNullable()
      table.string('empresa_contratante_representante_legal', 255).nullable()
      table.string('empresa_contratante_correo', 255).nullable()
      table.string('empresa_contratante_telefono', 20).nullable()

      table.timestamp('empresa_contratante_created_at').notNullable().defaultTo(this.now())
      table.timestamp('empresa_contratante_updated_at').nullable()
      table.timestamp('empresa_contratante_deleted_at').nullable().defaultTo(null)

      table.index(
        ['business_unit_id', 'empresa_contratante_deleted_at'],
        'idx_empresas_contratantes_business_unit'
      )
      table.index(
        ['business_unit_id', 'empresa_contratante_razon_social'],
        'idx_empresas_contratantes_razon_social'
      )
    })

    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      ADD COLUMN \`empresa_contratante_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`empresa_contratante_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`empresas_contratantes\`
      ADD UNIQUE KEY \`empresas_contratantes_business_unit_rfc_active_unique\`
        (\`business_unit_id\`, \`empresa_contratante_rfc\`, \`empresa_contratante_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
