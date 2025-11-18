import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'medical_condition_type_property_values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('medical_condition_type_property_value_id').primary()
      table.integer('medical_condition_type_property_id')
        .unsigned()
        .notNullable()
        .references('medical_condition_type_property_id')
        .inTable('medical_condition_type_properties')
        .onDelete('CASCADE')
        .withKeyName('fk_med_cond_type_props_values_prop_id')
      table.integer('employee_medical_condition_id')
        .unsigned()
        .notNullable()
        .references('employee_medical_condition_id')
        .inTable('employee_medical_conditions')
        .onDelete('CASCADE')
        .withKeyName('fk_med_cond_type_props_values_emp_med_cond_id')
      table.text('medical_condition_type_property_value').notNullable()
      table.integer('medical_condition_type_property_value_active').defaultTo(1).notNullable()
      table.timestamp('medical_condition_type_property_value_created_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_property_value_updated_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_property_value_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('medical_condition_type_property_id', 'fk_med_cond_type_props_values_prop_id')
      table.dropForeign('employee_medical_condition_id', 'fk_med_cond_type_props_values_emp_med_cond_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
