import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'access_point_employees'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_employee_id')
      table.integer('employee_id').unsigned().notNullable()
      table.foreign('employee_id').references('employees.employee_id')

      table.integer('access_point_id').unsigned().notNullable()
      table.foreign('access_point_id').references('access_points.access_point_id')

      table.string('access_point_employee_pin', 50).notNullable().defaultTo('')

      table.timestamp('access_point_employee_created_at').notNullable()
      table.timestamp('access_point_employee_updated_at').notNullable()
      table.timestamp('access_point_employee_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
