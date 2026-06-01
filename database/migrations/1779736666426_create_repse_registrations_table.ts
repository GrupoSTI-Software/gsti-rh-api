import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crea la tabla `repse_registrations` para administrar el registro REPSE
 * (Registro de Prestadoras de Servicios Especializados u Obras Especializadas)
 * de cada `BusinessUnit`.
 *
 * Detalles de diseño:
 *
 * - Soft delete: `repse_registration_deleted_at` para auditoría y para permitir
 *   la reutilización de un folio tras eliminar el registro previo.
 * - UNIQUE filtrado en MySQL: el patrón "UNIQUE (cols, deleted_at)" no funciona
 *   como filtered index porque NULL no participa en UNIQUE. La solución
 *   estándar es una columna generada virtual `repse_registration_is_active`
 *   que vale 1 cuando está activo y NULL cuando está soft-deleted; al ser
 *   NULL no participa en UNIQUE. Replica el patrón de `signup_drafts`.
 * - `status` se inicia como cadena con default `active`. El catálogo formal
 *   se ampliará en historias posteriores.
 */
export default class extends BaseSchema {
  protected tableName = 'repse_registrations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('repse_registration_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('repse_registration_folio', 50).notNullable()
      table.date('repse_registration_registered_at').notNullable()
      table.date('repse_registration_expires_at').notNullable()
      table
        .string('repse_registration_status', 20)
        .notNullable()
        .defaultTo('active')

      table.timestamp('repse_registration_created_at').notNullable().defaultTo(this.now())
      table.timestamp('repse_registration_updated_at').nullable()
      table.timestamp('repse_registration_deleted_at').nullable().defaultTo(null)

      table.index(
        ['business_unit_id', 'repse_registration_deleted_at'],
        'idx_repse_registrations_business_unit'
      )
    })

    /**
     * Columna generada virtual + UNIQUE compuesto: emula un filtered index en
     * MySQL para garantizar "máximo un folio activo por empresa" sin bloquear
     * el reuso tras un soft-delete. Se crea fuera de `createTable` porque
     * Knex no expone `generatedAs` para columnas virtuales en MySQL.
     */
    this.schema.raw(`
      ALTER TABLE \`repse_registrations\`
      ADD COLUMN \`repse_registration_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`repse_registration_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`repse_registrations\`
      ADD UNIQUE KEY \`repse_registrations_business_unit_folio_active_unique\`
        (\`business_unit_id\`, \`repse_registration_folio\`, \`repse_registration_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
