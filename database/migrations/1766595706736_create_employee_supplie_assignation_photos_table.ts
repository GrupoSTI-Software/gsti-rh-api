import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplie_assignation_photos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_supplie_assignation_photo_id')
      table.integer('employee_supply_id')
        .unsigned().notNullable()
        .references('employee_supply_id')
        .inTable('employee_supplies')
        .onDelete('cascade')
      table.enum('employee_supplie_assignation_photo_type', ['assignation', 'return']).notNullable()
      table.string('employee_supplie_assignation_photo_file', 255).notNullable()
      table.timestamp('employee_supplie_assignation_photo_created_at').notNullable()
      table.timestamp('employee_supplie_assignation_photo_updated_at').nullable()
      table.timestamp('employee_supplie_assignation_photo_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
