import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_annotations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_annotation_id').primary()
      table.integer('employee_id').unsigned().notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('cascade')
      table.text('employee_annotation_content').notNullable()
      table.boolean('employee_annotation_active').notNullable().defaultTo(true)
      table.integer('user_id').unsigned().notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('cascade')
      table.timestamp('employee_annotation_created_at').notNullable()
      table.timestamp('employee_annotation_updated_at').nullable()
      table.timestamp('employee_annotation_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('employee_id', 'fk_emp_annotations_emp_id')
      table.dropForeign('user_id', 'fk_emp_annotations_user_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
