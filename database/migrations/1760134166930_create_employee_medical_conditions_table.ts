import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_medical_conditions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_medical_condition_id').primary()
      table.integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
        .withKeyName('fk_emp_med_conds_emp_id')
      table.integer('medical_condition_type_id').unsigned().notNullable()
        .notNullable()
        .references('medical_condition_type_id')
        .inTable('medical_condition_types')
        .onDelete('CASCADE')
        .withKeyName('fk_emp_med_conds_med_cond_type_id')
      table.text('employee_medical_condition_diagnosis').notNullable()
      table.text('employee_medical_condition_treatment').nullable()
      table.text('employee_medical_condition_notes').nullable()
      table.integer('employee_medical_condition_active').defaultTo(1).notNullable()
      table.timestamp('employee_medical_condition_created_at').defaultTo(this.now())
      table.timestamp('employee_medical_condition_updated_at').defaultTo(this.now())
      table.timestamp('employee_medical_condition_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('employee_id', 'fk_emp_med_conds_emp_id')
      table.dropForeign('medical_condition_type_id', 'fk_emp_med_conds_med_cond_type_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
