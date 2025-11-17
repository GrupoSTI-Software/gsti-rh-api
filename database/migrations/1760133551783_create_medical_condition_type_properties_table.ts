import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'medical_condition_type_properties'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('medical_condition_type_property_id').primary()
      table.string('medical_condition_type_property_name', 100).notNullable()
      table.text('medical_condition_type_property_description').nullable()
      table.string('medical_condition_type_property_data_type', 50).notNullable()
      table.integer('medical_condition_type_property_required').defaultTo(0).notNullable()
      table.integer('medical_condition_type_id')
        .unsigned()
        .notNullable()
        .references('medical_condition_type_id')
        .inTable('medical_condition_types')
        .onDelete('CASCADE')
        .withKeyName('fk_med_cond_type_props_type_id')

      table.integer('medical_condition_type_property_active').defaultTo(1).notNullable()
      table.timestamp('medical_condition_type_property_created_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_property_updated_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_property_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('medical_condition_type_id', 'fk_med_cond_type_props_type_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
