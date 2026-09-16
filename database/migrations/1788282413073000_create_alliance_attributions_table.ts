import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Atribución de una empresa cliente a una alianza comercial
 * (USRH1789099318034).
 *
 * Un cliente tiene como máximo una atribución viva. La garantía vive en
 * la columna generada `alliance_attribution_is_live` + UNIQUE
 * `(business_unit_id, alliance_attribution_is_live)`: al cerrar, `is_live`
 * pasa a NULL y MySQL libera el slot. No se copia el UNIQUE de
 * `tenant_billing_profiles` (solo mira `deleted_at`): la atribución se
 * cierra sin borrarse y ese índice nunca se liberaría.
 *
 * La columna generada y el UNIQUE van fuera de `createTable` porque Knex
 * no expone `generatedAs` virtual en MySQL. Sin `await this.schema`.
 */
export default class extends BaseSchema {
  protected tableName = 'alliance_attributions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('alliance_attribution_id').notNullable()

      table
        .integer('alliance_id')
        .unsigned()
        .notNullable()
        .references('alliance_id')
        .inTable('alliances')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.decimal('alliance_attribution_commission_percent', 5, 2).notNullable()

      table
        .integer('alliance_attribution_term_periods')
        .unsigned()
        .nullable()
        .comment('NULL = plazo indeterminado')

      table.date('alliance_attribution_starts_at').notNullable()

      table.timestamp('alliance_attribution_closed_at').nullable().defaultTo(null)
      table.string('alliance_attribution_close_reason', 500).nullable()

      table.timestamps(true, true)

      table.timestamp('alliance_attribution_deleted_at').nullable().defaultTo(null)

      table.index(['alliance_id'], 'idx_alliance_attributions_alliance_id')
    })

    this.schema.raw(`
      ALTER TABLE \`alliance_attributions\`
      ADD COLUMN \`alliance_attribution_is_live\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`alliance_attribution_closed_at\` IS NULL
               AND \`alliance_attribution_deleted_at\` IS NULL
               THEN 1 ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`alliance_attributions\`
      ADD UNIQUE KEY \`alliance_attributions_business_unit_live_unique\`
        (\`business_unit_id\`, \`alliance_attribution_is_live\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
