import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_bonuses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_bonus_id').notNullable()
      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table.string('employee_bonus_concept', 255).notNullable()
      table.integer('employee_bonus_quantity').notNullable()
      table.decimal('employee_bonus_unit_amount', 12, 2).notNullable()
      table.decimal('employee_bonus_total', 12, 2).notNullable()
      table.date('employee_bonus_assignment_date').notNullable()
      table.date('employee_bonus_payment_date').notNullable()

      table.timestamp('employee_bonus_created_at').notNullable()
      table.timestamp('employee_bonus_updated_at').nullable()
      table.timestamp('employee_bonus_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
