import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'competency_brackets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('competency_bracket_id')

      table.integer('competency_descriptor_id').unsigned().notNullable().references('competency_descriptors.competency_descriptor_id').onDelete('CASCADE')
      table.text('competency_bracket_description').notNullable()
      table.decimal('competency_bracket_range_min', 4, 2).notNullable()
      table.decimal('competency_bracket_range_max', 4, 2).notNullable()
      table.smallint('competency_bracket_position').notNullable()

      table.timestamp('competency_bracket_created_at').notNullable()
      table.timestamp('competency_bracket_updated_at').nullable()
      table.timestamp('competency_bracket_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}