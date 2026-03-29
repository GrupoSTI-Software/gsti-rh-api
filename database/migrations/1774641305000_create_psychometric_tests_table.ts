import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'psychometric_tests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('psychometric_test_id').notNullable()
      table.string('psychometric_test_name', 200).notNullable()
      table.text('psychometric_test_description').nullable()

      table.timestamp('psychometric_test_created_at').notNullable()
      table.timestamp('psychometric_test_updated_at').nullable()
      table.timestamp('psychometric_test_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
