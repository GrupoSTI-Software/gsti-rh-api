import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('user_email_type', ['institutional', 'personal'])
        .after('user_business_access')
        .notNullable().defaultTo('institutional')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_email_type')
    })
  }
}

