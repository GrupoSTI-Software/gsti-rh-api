import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'medical_condition_types'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('medical_condition_type_id').primary()
      table.string('medical_condition_type_name', 100).notNullable()
      table.text('medical_condition_type_description').nullable()
      table.integer('medical_condition_type_active').defaultTo(1).notNullable()
      table.timestamp('medical_condition_type_created_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_updated_at').defaultTo(this.now())
      table.timestamp('medical_condition_type_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
