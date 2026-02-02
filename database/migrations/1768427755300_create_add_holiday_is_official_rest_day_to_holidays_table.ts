import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'holidays'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('holiday_is_official_rest_day')
        .notNullable()
        .defaultTo(true)
        .after('holiday_frequency')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('holiday_is_official_rest_day')
    })
  }
}

