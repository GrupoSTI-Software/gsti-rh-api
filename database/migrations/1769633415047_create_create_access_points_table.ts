import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'access_points'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_id').notNullable()
      table.string('access_point_name', 200).notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table.foreign('business_unit_id').references('business_unit_id').inTable('business_units').onDelete('CASCADE')
      table.integer('access_point_active').defaultTo(0).notNullable()
      table.string('access_point_serial_number', 100).nullable()
      table.string('access_point_device_name', 200).nullable()
      table.string('access_point_ip', 45).nullable()
      table.string('access_point_mac', 50).nullable()
      table.string('access_point_firmware', 100).nullable()
      table.string('access_point_platform', 100).nullable()
      table.integer('access_point_status').defaultTo(0).notNullable().comment('0 = offline, 1 = online')
      table.timestamp('access_point_last_connection').nullable()

      table.timestamp('access_point_created_at').notNullable()
      table.timestamp('access_point_updated_at').nullable()
      table.timestamp('access_point_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}