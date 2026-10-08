import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supply_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('supply_type_telework_category', [
          'ergonomic_chair',
          'computing_equipment',
          'accessory',
        ])
        .nullable()
        .after('supply_type_slug')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('supply_type_telework_category')
    })
  }
}
