import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Un celular se registra una vez por empresa, no una vez en toda la plataforma.
 *
 * El candado de celular evita que un compañero cheque por otro dentro de la
 * misma empresa; entre empresas no protege nada y la misma persona puede ser
 * colaboradora de dos tenants con el mismo teléfono.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_devices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['employee_device_token'], 'employee_devices_employee_device_token_unique')
      table.unique(
        ['employee_device_token', 'business_unit_id'],
        'employee_devices_token_business_unit_unique'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        ['employee_device_token', 'business_unit_id'],
        'employee_devices_token_business_unit_unique'
      )
      table.unique(['employee_device_token'], 'employee_devices_employee_device_token_unique')
    })
  }
}
