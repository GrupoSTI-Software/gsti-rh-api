import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_devices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_device_id')
      table.string('employee_device_token', 250).notNullable().unique()
      table.string('employee_device_model', 250).notNullable()
      table.string('employee_device_brand', 250).notNullable()
      table.string('employee_device_type', 250).notNullable()
      table.text('employee_device_os').notNullable()
      table.tinyint('employee_device_active').defaultTo(1).notNullable()

      table.integer('employee_id').unsigned().notNullable()
      table.foreign('employee_id').references('employees.employee_id')

      table.timestamp('employee_device_created_at').notNullable()
      table.timestamp('employee_device_updated_at')
      table.timestamp('employee_device_deleted_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
