import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'career_path_override_reasons'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('career_path_override_reason_id')

      table.string('career_path_override_reason_key', 100).notNullable()
      table.string('career_path_override_reason_label', 100).notNullable()
      table.tinyint('career_path_override_reason_active').defaultTo(1).notNullable()

      table.timestamp('career_path_override_reason_created_at').notNullable()
      table.timestamp('career_path_override_reason_updated_at').nullable()
      table.timestamp('career_path_override_reason_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}