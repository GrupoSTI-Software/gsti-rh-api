import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'positions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .text('position_general_objective')
        .after('position_description')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_general_objective')
    })
  }
}

