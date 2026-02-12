import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('notice_id').notNullable()
      table.string('notice_subject', 500).notNullable()
      table.text('notice_description', 'longtext').notNullable()
      table.text('notice_recipient_emails', 'longtext').nullable() // JSON array de emails
      table.integer('notice_sent_count').defaultTo(0).notNullable()
      table.timestamp('notice_sent_at').nullable()

      table.timestamp('notice_created_at').notNullable()
      table.timestamp('notice_updated_at').nullable()
      table.timestamp('notice_deleted_at').nullable()
    })

    this.schema.createTable('notice_recipients', (table) => {
      table.increments('notice_recipient_id').notNullable()
      table.integer('notice_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().nullable()
      table.string('employee_email', 255).notNullable()
      table.string('employee_name', 500).nullable()
      table.boolean('notice_recipient_sent').defaultTo(false).notNullable()
      table.timestamp('notice_recipient_sent_at').nullable()
      table.text('notice_recipient_error', 'longtext').nullable()

      table.timestamp('notice_recipient_created_at').notNullable()
      table.timestamp('notice_recipient_updated_at').nullable()
      table.timestamp('notice_recipient_deleted_at').nullable()

      table.foreign('notice_id').references('notice_id').inTable('notices').onDelete('CASCADE')
      table.foreign('employee_id').references('employee_id').inTable('employees').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.dropTable('notice_recipients')
    this.schema.dropTable(this.tableName)
  }
}
