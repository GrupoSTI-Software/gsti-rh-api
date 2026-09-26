import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de proveedores REPSE del contratante (USRH1784259105646).
 *
 * A diferencia de `repse_registrations` / `empresas_contratantes` (lado
 * prestador: el tenant es el prestador REPSE), esta tabla modela el lado
 * contratante: el tenant compra servicios especializados y cataloga a SUS
 * proveedores REPSE para vigilar que su folio siga vigente.
 *
 * Detalles de diseño (mismo patrón que `repse_registrations`):
 * - Soft delete: `proveedor_repse_deleted_at`.
 * - RFC cifrado en el modelo (AES-256-CBC, igual que `EmpresaContratante.rfc`)
 *   con huella `proveedor_repse_rfc_hash` (blind index) para validar
 *   duplicados sin descifrar.
 * - UNIQUE filtrado vía columna generada virtual `proveedor_repse_is_active`
 *   (NULL en soft-deleted, no participa en UNIQUE) sobre `(business_unit_id,
 *   proveedor_repse_folio)`: un folio no puede repetirse activo dentro de la
 *   misma empresa contratante.
 * - `proveedor_repse_next_review_at` se recalcula al registrar una
 *   validación (fecha de validación + periodicidad); NULL mientras no tenga
 *   ninguna validación (indicador "pendiente de primera validación").
 */
export default class extends BaseSchema {
  protected tableName = 'proveedores_repse'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('proveedor_repse_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_proveedor_repse_business_unit')
        .onDelete('RESTRICT')

      table.string('proveedor_repse_razon_social', 255).notNullable()
      table.string('proveedor_repse_rfc', 191).notNullable()
      table.string('proveedor_repse_rfc_hash', 64).notNullable()
      table.string('proveedor_repse_folio', 50).notNullable()
      table.text('proveedor_repse_objeto_registrado').notNullable()
      table.date('proveedor_repse_folio_vencimiento').notNullable()
      table.smallint('proveedor_repse_periodicidad_meses').unsigned().notNullable().defaultTo(1)
      table.date('proveedor_repse_next_review_at').nullable().defaultTo(null)

      table.timestamp('proveedor_repse_created_at').notNullable().defaultTo(this.now())
      table.timestamp('proveedor_repse_updated_at').nullable()
      table.timestamp('proveedor_repse_deleted_at').nullable().defaultTo(null)

      table.index(
        ['business_unit_id', 'proveedor_repse_deleted_at'],
        'idx_proveedores_repse_business_unit'
      )
      table.index(
        ['business_unit_id', 'proveedor_repse_next_review_at'],
        'idx_proveedores_repse_next_review'
      )
    })

    /**
     * Columna generada virtual + UNIQUE compuesto: emula un filtered index en
     * MySQL para garantizar "máximo un folio activo por empresa contratante"
     * sin bloquear el reuso tras un soft-delete. Mismo patrón que
     * `repse_registrations` (1779736666426_create_repse_registrations_table.ts).
     */
    this.schema.raw(`
      ALTER TABLE \`proveedores_repse\`
      ADD COLUMN \`proveedor_repse_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`proveedor_repse_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`proveedores_repse\`
      ADD UNIQUE KEY \`proveedores_repse_business_unit_folio_active_unique\`
        (\`business_unit_id\`, \`proveedor_repse_folio\`, \`proveedor_repse_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
