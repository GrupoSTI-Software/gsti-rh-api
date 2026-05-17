import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'competency_level_descriptions'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }
  
  async down() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('competency_level_description_id')

      table.integer('competency_id').unsigned().references('competencies.competency_id')
      table
        .integer('competency_level_id')
        .unsigned()
        .references('competency_levels.competency_level_id')

      table.text('competency_level_description').notNullable()

      table.timestamp('competency_level_description_created_at').notNullable()
      table.timestamp('competency_level_description_updated_at').nullable()
      table.timestamp('competency_level_description_deleted_at').nullable()

      table.unique(['competency_id', 'competency_level_id'], 'cld_comp_lvl_unique')
    })
  }
}