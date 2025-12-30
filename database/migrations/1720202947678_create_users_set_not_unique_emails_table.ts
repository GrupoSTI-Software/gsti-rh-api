import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('user_email', 200).notNullable().alter()
      table.dropUnique(['user_email'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('user_email', 200).notNullable().alter()
      table.unique(['user_email'])
    })
  }
}
