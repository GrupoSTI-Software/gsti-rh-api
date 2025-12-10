import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'zones'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('zone_id').notNullable()
      table.string('zone_name', 200).notNullable()
      table.string('zone_thumbnail', 255).nullable()
      table.text('zone_address', 'longtext').notNullable()
      table.text('zone_polygon', 'longtext').notNullable()

      table.timestamp('zone_created_at').notNullable()
      table.timestamp('zone_updated_at').nullable()
      table.timestamp('zone_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

