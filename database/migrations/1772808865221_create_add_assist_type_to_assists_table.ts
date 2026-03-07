import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('assist_type', ['check', 'eatin', 'eatout'])
        .after('assist_active')
        .nullable().defaultTo('check')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assist_type')
    })
  }
}

