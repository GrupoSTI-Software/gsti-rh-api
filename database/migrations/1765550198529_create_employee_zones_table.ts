import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_zones'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_zone_id')
    
      table.integer('employee_id').unsigned().notNullable()
      table
        .foreign('employee_id')
        .references('employees.employee_id')

      table.integer('zone_id').unsigned().notNullable()
      table
        .foreign('zone_id')
        .references('zones.zone_id')

      table.timestamp('employee_zone_created_at').notNullable()
      table.timestamp('employee_zone_updated_at').notNullable()
      table.timestamp('employee_zone_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}