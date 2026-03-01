import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notice_files'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('notice_file_id').primary()
      table.integer('notice_id').unsigned().notNullable()
        .references('notice_id')
        .inTable('notices')
        .onDelete('cascade')

      table.text('notice_file_path').notNullable()
      table.timestamp('notice_file_created_at').notNullable()
      table.timestamp('notice_file_updated_at').nullable()
      table.timestamp('notice_file_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
