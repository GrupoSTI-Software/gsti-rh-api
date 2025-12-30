import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('user_id').unsigned().notNullable().after('exception_request_check_out_time')
      table.foreign('user_id').references('users.user_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign(['user_id'])
      table.dropColumn('user_id')
    })
  }
}
