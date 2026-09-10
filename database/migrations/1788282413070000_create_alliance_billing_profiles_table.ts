import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Perfil fiscal de la alianza comercial (USRH1788505941893).
 *
 * Espejo 1:1 de `tenant_billing_profiles`: un registro vivo por alianza vía
 * columna generada + UNIQUE `(alliance_id, alliance_billing_profile_is_active)`.
 * El RFC se cifra en reposo; el hash permite búsqueda sin descifrar y
 * **no** es UNIQUE (dos alianzas pueden compartir RFC).
 */
export default class extends BaseSchema {
  protected tableName = 'alliance_billing_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('alliance_billing_profile_id').notNullable()

      table
        .integer('alliance_id')
        .unsigned()
        .notNullable()
        .references('alliance_id')
        .inTable('alliances')
        .onDelete('RESTRICT')

      table.string('alliance_billing_profile_rfc', 191).nullable()
      table.string('alliance_billing_profile_rfc_hash', 64).nullable()
      table.string('alliance_billing_profile_legal_name', 250).notNullable()
      table.string('alliance_billing_profile_postal_code', 5).nullable()
      table.string('alliance_billing_profile_tax_regime_code', 3).nullable()
      table.string('alliance_billing_profile_cfdi_use_code', 4).nullable()
      table.string('alliance_billing_profile_billing_email', 191).nullable()

      table.timestamps(true, true)

      table.timestamp('alliance_billing_profile_deleted_at').nullable().defaultTo(null)

      table.index(
        ['alliance_billing_profile_rfc_hash'],
        'idx_alliance_billing_profiles_rfc_hash'
      )
    })

    this.schema.raw(`
      ALTER TABLE \`alliance_billing_profiles\`
      ADD COLUMN \`alliance_billing_profile_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`alliance_billing_profile_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`alliance_billing_profiles\`
      ADD UNIQUE KEY \`alliance_billing_profiles_alliance_active_unique\`
        (\`alliance_id\`, \`alliance_billing_profile_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
