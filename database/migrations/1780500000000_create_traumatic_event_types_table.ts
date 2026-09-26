import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'traumatic_event_types'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_type_id')
      table.string('traumatic_event_type_name', 100).notNullable()
      table.string('traumatic_event_type_description', 500).notNullable()
      table.string('traumatic_event_type_slug', 250).notNullable()
      table.unique(['traumatic_event_type_slug'])
      table.tinyint('traumatic_event_type_active').notNullable()
      table.timestamp('traumatic_event_type_created_at').notNullable()
      table.timestamp('traumatic_event_type_updated_at').notNullable()
      table.timestamp('traumatic_event_type_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
