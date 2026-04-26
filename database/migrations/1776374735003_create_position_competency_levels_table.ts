import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_competency_levels'

  async up() {
    // La tabla pudo haber sido creada por la version previa de esta rama
    // con columnas de descripcion por nivel. Se reemplaza por el nuevo
    // esquema que solo referencia un nivel del catalogo.
    this.schema.dropTableIfExists(this.tableName)

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

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
