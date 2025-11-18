import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'proceeding_file_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enu('proceeding_file_type_area_to_use', ['employee', 'aircraft']).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('proceeding_file_type_area_to_use', 100).notNullable().alter()
    })
  }
}
