import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_competency_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_competency_level_id')

      table.integer('position_id').unsigned().references('positions.position_id')
      table.integer('competency_id').unsigned().references('competencies.competency_id')

      table.text('position_competency_level_in_development_description').nullable()
      table.text('position_competency_level_capable_description').nullable()
      table.text('position_competency_level_expert_description').nullable()

      table.timestamp('position_competency_level_created_at').notNullable()
      table.timestamp('position_competency_level_updated_at').nullable()
      table.timestamp('position_competency_level_deleted_at').nullable()

      // Indice unico para evitar asignar la misma competencia dos veces al mismo puesto
      table.unique(['position_id', 'competency_id'], 'pcl_pos_comp_unique')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
