import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vacation_authorization_signatures'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('vacation_authorization_signature_id')
      table.integer('exception_request_id')
      .unsigned()
      .notNullable()
      .references('exception_request_id')
      .inTable('exception_requests')
      .onDelete('CASCADE')
      table.integer('shift_exception_id')
      .unsigned()
      .notNullable()
      .references('shift_exception_id')
      .inTable('shift_exceptions')
      .onDelete('CASCADE')
      table.string('vacation_authorization_signature_file', 250).notNullable()
      table.timestamp('vacation_authorization_signature_created_at').notNullable()
      table.timestamp('vacation_authorization_signature_updated_at').nullable()
      table.timestamp('vacation_authorization_signature_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
