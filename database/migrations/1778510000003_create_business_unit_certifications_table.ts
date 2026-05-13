import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'business_unit_certifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer('certification_id')
        .unsigned()
        .notNullable()
        .references('certification_id')
        .inTable('certifications')
        .onDelete('CASCADE')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      table.primary(['certification_id', 'business_unit_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
