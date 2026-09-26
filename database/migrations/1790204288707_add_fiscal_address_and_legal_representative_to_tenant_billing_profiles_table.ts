import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Domicilio fiscal completo y representante legal del perfil fiscal del tenant
 * (USRH1789097550393). Aditiva sobre `tenant_billing_profiles`: ocho columnas
 * NULLABLE porque hay filas vivas y los campos son opcionales (regla 4). Sin
 * índices (no se busca por domicilio) y sin tocar la columna generada
 * `tenant_billing_profile_is_active` ni su UNIQUE. El código postal ya existe
 * y no se duplica. Sin `await` sobre `this.schema` (regla del repo).
 */
export default class extends BaseSchema {
  protected tableName = 'tenant_billing_profiles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('tenant_billing_profile_street', 150).nullable()
      table.string('tenant_billing_profile_exterior_number', 20).nullable()
      table.string('tenant_billing_profile_interior_number', 20).nullable()
      table.string('tenant_billing_profile_neighborhood', 150).nullable()
      table.string('tenant_billing_profile_municipality', 150).nullable()
      table.string('tenant_billing_profile_state', 100).nullable()
      table.string('tenant_billing_profile_legal_representative_name', 200).nullable()
      table.string('tenant_billing_profile_legal_representative_role', 120).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tenant_billing_profile_street')
      table.dropColumn('tenant_billing_profile_exterior_number')
      table.dropColumn('tenant_billing_profile_interior_number')
      table.dropColumn('tenant_billing_profile_neighborhood')
      table.dropColumn('tenant_billing_profile_municipality')
      table.dropColumn('tenant_billing_profile_state')
      table.dropColumn('tenant_billing_profile_legal_representative_name')
      table.dropColumn('tenant_billing_profile_legal_representative_role')
    })
  }
}
