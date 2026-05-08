import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_business_unit_competency_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_business_unit_competency_level_id')

      table.integer('position_id').unsigned().notNullable().references('positions.position_id')
      table.integer('competency_id').unsigned().notNullable().references('competencies.competency_id')
      table.integer('business_unit_competency_level_id').unsigned()

      table.foreign('business_unit_competency_level_id', 'fk_pbucl_bucl').references('business_unit_competency_level_id').inTable('business_unit_competency_levels')

      table.timestamp('position_business_unit_competency_level_created_at').notNullable()
      table.timestamp('position_business_unit_competency_level_updated_at').nullable()
      table.timestamp('position_business_unit_competency_level_deleted_at').nullable()

      table.unique(['position_id', 'business_unit_competency_level_id'], 'pbc_pos_buc_unique')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}