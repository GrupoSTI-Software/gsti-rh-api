import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_business_access')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('user_business_access', 255).after('pin_code_expires_at').nullable()
    })
  }
}