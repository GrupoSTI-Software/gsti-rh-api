import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_supply_id')
      table.integer('employee_id').unsigned()
        .references('employee_id')
        .inTable('employees')
        .notNullable()
        .onDelete('cascade')
      table.integer('supply_id').unsigned()
        .references('supply_id')
        .inTable('supplies')
        .notNullable()
        .onDelete('cascade')
      table.enum('employee_supply_status', ['active', 'retired', 'shipping']).notNullable().defaultTo('active')
      table.text('employee_supply_retirement_reason').nullable()
      table.date('employee_supply_retirement_date').nullable()
      table.timestamp('employee_supply_created_at').notNullable()
      table.timestamp('employee_supply_updated_at').nullable()
      table.timestamp('employee_supply_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
