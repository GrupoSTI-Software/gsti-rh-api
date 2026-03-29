import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_specific_functions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('position_specific_function_type', 'position_specific_function_frequency')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('position_specific_function_frequency', 'position_specific_function_type')
    })
  }
}