import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'psychometric_test_dimensions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('psychometric_test_dimension_id').notNullable()
      table
        .integer('psychometric_test_id')
        .unsigned()
        .notNullable()
        .references('psychometric_test_id')
        .inTable('psychometric_tests')
        .onDelete('CASCADE')
      table.string('psychometric_test_dimension_name', 200).notNullable()
      table.string('psychometric_test_dimension_acronym', 20).notNullable()

      table.timestamp('psychometric_test_dimension_created_at').notNullable()
      table.timestamp('psychometric_test_dimension_updated_at').nullable()
      table.timestamp('psychometric_test_dimension_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
