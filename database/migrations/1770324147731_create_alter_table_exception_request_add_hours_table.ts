import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exception_requests'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.tinyint('exception_request_period_in_hours').after('exception_request_check_out_time').nullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('exception_request_period_in_hours')
    })
  }
}
