import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'business_unit_competency_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('business_unit_competency_level_id')

      table.integer('business_unit_id').unsigned().references('business_units.business_unit_id')
      table.string('business_unit_competency_level_label', 50).notNullable()
      table.smallint('business_unit_competency_level_position').notNullable()

      table.timestamp('business_unit_competency_level_created_at').notNullable()
      table.timestamp('business_unit_competency_level_updated_at').nullable()
      table.timestamp('business_unit_competency_level_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}