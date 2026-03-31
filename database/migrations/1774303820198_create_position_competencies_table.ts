import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_competencies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_competency_id')

      table.integer('position_id').unsigned().references('positions.position_id')
      table.integer('weight_id').unsigned().references('weights.weight_id')

      table.text('position_competency_name').notNullable()
      table.enum('position_competency_type', ['technical' , 'functional' ,'value']).notNullable()

      table.timestamp('position_competency_created_at').notNullable()
      table.timestamp('position_competency_updated_at').nullable()
      table.timestamp('position_competency_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}