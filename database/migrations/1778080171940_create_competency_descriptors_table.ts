import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'competency_descriptors'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('competency_descriptor_id')

      table.integer('competency_id').unsigned().notNullable().references('competencies.competency_id')
      table.integer('business_unit_competency_level_id').unsigned().notNullable().references('business_unit_competency_levels.business_unit_competency_level_id')
      table.text('competency_descriptor_description').notNullable()

      table.timestamp('competency_descriptor_created_at').notNullable()
      table.timestamp('competency_descriptor_updated_at').nullable()
      table.timestamp('competency_descriptor_deleted_at').nullable()

    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}