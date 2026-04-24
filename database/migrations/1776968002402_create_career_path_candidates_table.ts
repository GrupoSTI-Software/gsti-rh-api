import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'career_path_candidates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('career_path_candidate_id')

      table.integer('business_unit_id').unsigned().notNullable().references('business_units.business_unit_id')
      table.integer('employee_id').unsigned().notNullable().references('employees.employee_id')
      table.integer('origin_position_id').unsigned().notNullable().references('positions.position_id')
      table.integer('target_position_id').unsigned().notNullable().references('positions.position_id')
      table.boolean('career_path_candidate_is_override').notNullable().defaultTo(false)
      table.integer('career_path_override_reason_id').unsigned().nullable().references('career_path_override_reasons.career_path_override_reason_id')
      
      table.text('career_path_candidate_justification').nullable()
      table.enu('career_path_candidate_status', ['propuesto', 'activo', 'rechazado', 'desactivado', 'expirado']).notNullable().defaultTo('propuesto')
      table.integer('proposed_by').unsigned().notNullable().references('users.user_id')
      table.integer('reviewed_by').unsigned().nullable().references('users.user_id')
      table.timestamp('career_path_candidate_reviewed_at').nullable()
      table.text('career_path_candidate_rejection_reason').nullable()
      table.timestamp('career_path_candidate_activated_at').nullable()
      table.timestamp('career_path_candidate_expires_at').nullable()

      table.timestamp('career_path_candidate_created_at').notNullable()
      table.timestamp('career_path_candidate_updated_at').nullable()
      table.timestamp('career_path_candidate_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}