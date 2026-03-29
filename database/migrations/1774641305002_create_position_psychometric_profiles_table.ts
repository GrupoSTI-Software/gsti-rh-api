import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_psychometric_profiles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_psychometric_profile_id').notNullable()
      table.integer('position_id').unsigned().notNullable()
      table.integer('psychometric_test_dimension_id').unsigned().notNullable()

      table
        .foreign('position_id', 'pos_psych_profile_position_fk')
        .references('position_id')
        .inTable('positions')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_dimension_id', 'pos_psych_profile_dimension_fk')
        .references('psychometric_test_dimension_id')
        .inTable('psychometric_test_dimensions')
        .onDelete('CASCADE')
      table.decimal('position_psychometric_profile_minimum_value', 10, 2).notNullable()
      table.decimal('position_psychometric_profile_maximum_value', 10, 2).notNullable()

      table.timestamp('position_psychometric_profile_created_at').notNullable()
      table.timestamp('position_psychometric_profile_updated_at').nullable()
      table.timestamp('position_psychometric_profile_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
