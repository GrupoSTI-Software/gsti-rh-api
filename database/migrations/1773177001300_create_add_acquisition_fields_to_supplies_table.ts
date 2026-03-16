import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supplies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('supply_acquisition_date').nullable()
      table.decimal('supply_acquisition_value', 14, 2).unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('supply_acquisition_date')
      table.dropColumn('supply_acquisition_value')
    })
  }
}
