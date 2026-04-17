import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_branch_offices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_branch_office_id').notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table
        .foreign('employee_id')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table.integer('branch_office_id').unsigned().notNullable()
      table
        .foreign('branch_office_id')
        .references('branch_office_id')
        .inTable('branch_offices')
        .onDelete('RESTRICT')
      /** 1 = asignación vigente; 0 = histórico (desactivada, sin borrar fila) */
      table.tinyint('employee_branch_office_active').notNullable().defaultTo(1)
      table.timestamp('employee_branch_office_deactivated_at').nullable()
      table.timestamp('employee_branch_office_created_at').notNullable()
      table.timestamp('employee_branch_office_updated_at').nullable()
      table.index(['employee_id', 'employee_branch_office_active'], 'employee_branch_offices_employee_active_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
