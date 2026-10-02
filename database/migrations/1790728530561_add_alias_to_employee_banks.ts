import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Alias de la cuenta bancaria del colaborador ("Cuenta de nómina"): etiqueta
 * libre para distinguir el uso de cada cuenta. No es dato sensible, por eso no
 * se cifra ni se enmascara.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_banks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_bank_alias', 40).nullable().after('bank_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_bank_alias')
    })
  }
}
