import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Perfil de facturación del tenant (USRH1786737531057).
 *
 * Un registro vivo por empresa vía columna generada `tenant_billing_profile_is_active`
 * y UNIQUE `(business_unit_id, tenant_billing_profile_is_active)`.
 * El RFC se almacena cifrado; la huella permite búsqueda sin descifrar.
 */
export default class extends BaseSchema {
  protected tableName = 'tenant_billing_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('tenant_billing_profile_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('tenant_billing_profile_rfc', 191).nullable()
      table.string('tenant_billing_profile_rfc_hash', 64).nullable()
      table.string('tenant_billing_profile_legal_name', 250).notNullable()

      table.timestamp('tenant_billing_profile_created_at').notNullable().defaultTo(this.now())
      table.timestamp('tenant_billing_profile_updated_at').nullable()
      table.timestamp('tenant_billing_profile_deleted_at').nullable().defaultTo(null)

      table.index(
        ['tenant_billing_profile_rfc_hash'],
        'idx_tenant_billing_profiles_rfc_hash'
      )
    })

    this.schema.raw(`
      ALTER TABLE \`tenant_billing_profiles\`
      ADD COLUMN \`tenant_billing_profile_is_active\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`tenant_billing_profile_deleted_at\` IS NULL THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`tenant_billing_profiles\`
      ADD UNIQUE KEY \`tenant_billing_profiles_business_unit_active_unique\`
        (\`business_unit_id\`, \`tenant_billing_profile_is_active\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
