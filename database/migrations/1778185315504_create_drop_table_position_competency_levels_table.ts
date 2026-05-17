import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_competency_levels'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_competency_level_id')

      table.integer('position_id').unsigned().references('positions.position_id')
      table.integer('competency_id').unsigned().references('competencies.competency_id')
      table
        .integer('competency_level_id')
        .unsigned()
        .references('competency_levels.competency_level_id')

      table.timestamp('position_competency_level_created_at').notNullable()
      table.timestamp('position_competency_level_updated_at').nullable()
      table.timestamp('position_competency_level_deleted_at').nullable()

      table.unique(['position_id', 'competency_id'], 'pcl_pos_comp_unique')
    })
    
  }
}