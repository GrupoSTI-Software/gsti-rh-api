import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'career_path_templates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('career_path_template_id')

      table.integer('company_id').unsigned().references('business_units.business_unit_id')
      table.integer('origin_position_id').unsigned().references('positions.position_id')
      table.integer('target_position_id').unsigned().references('positions.position_id')
      table.integer('created_by').unsigned().references('users.user_id')
      table.integer('updated_by').unsigned().references('users.user_id')

      table.timestamp('career_path_template_created_at').notNullable()
      table.timestamp('career_path_template_updated_at').nullable()
      table.timestamp('career_path_template_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}