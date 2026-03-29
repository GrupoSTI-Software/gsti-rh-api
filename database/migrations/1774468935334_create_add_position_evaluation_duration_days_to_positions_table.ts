import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'positions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('position_evaluation_duration_days')
        .after('position_evaluation_frequency')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('position_evaluation_duration_days')
    })
  }
}

