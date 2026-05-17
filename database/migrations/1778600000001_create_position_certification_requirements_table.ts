import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_certification_requirements'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_certification_requirement_id').notNullable()

      table
        .integer('position_id')
        .unsigned()
        .notNullable()
        .references('position_id')
        .inTable('positions')
        .onDelete('CASCADE')

      table
        .integer('certification_id')
        .unsigned()
        .notNullable()
        .references('certification_id')
        .inTable('certifications')
        .onDelete('RESTRICT')

      table.timestamp('position_certification_requirement_created_at').notNullable()
      table.timestamp('position_certification_requirement_updated_at').nullable()
      table.timestamp('position_certification_requirement_deleted_at').nullable()

      table.unique(['position_id', 'certification_id'], { indexName: 'uq_pcr_position_certification' })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
