import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_competencies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('competency_id')
      .unsigned()
      .references('competencies.competency_id')
      .after('weight_id')
      .nullable()
      .defaultTo(null)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['competency_id'])
      table.dropColumn('competency_id')
    })
  }
}