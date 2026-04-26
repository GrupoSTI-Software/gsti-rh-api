import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'competencies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('competency_id')

      table.string('competency_name', 255).notNullable()
      table.enum('competency_type', ['technical', 'transversal']).notNullable()

      table.timestamp('competency_created_at').notNullable()
      table.timestamp('competency_updated_at').nullable()
      table.timestamp('competency_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
