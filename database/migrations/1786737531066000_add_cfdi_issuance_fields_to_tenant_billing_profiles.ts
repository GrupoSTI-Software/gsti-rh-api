import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Campos de emisión CFDI del perfil fiscal del tenant (USRH1786737531066).
 * Aditiva sobre tenant_billing_profiles; sin FK al catálogo SAT (clave natural).
 */
export default class extends BaseSchema {
  protected tableName = 'tenant_billing_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('tenant_billing_profile_postal_code', 5).nullable()
      table.string('tenant_billing_profile_tax_regime_code', 3).nullable()
      table.string('tenant_billing_profile_billing_email', 191).nullable()
      table.string('tenant_billing_profile_cfdi_use_code', 4).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tenant_billing_profile_postal_code')
      table.dropColumn('tenant_billing_profile_tax_regime_code')
      table.dropColumn('tenant_billing_profile_billing_email')
      table.dropColumn('tenant_billing_profile_cfdi_use_code')
    })
  }
}
