import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'career_path_candidate_status_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('career_path_candidate_status_history_id')

      table.integer('career_path_candidate_id').unsigned().notNullable().references('career_path_candidates.career_path_candidate_id').withKeyName('cpcsh_candidate_id_fk')
      table.integer('changed_by').unsigned().notNullable().references('users.user_id')

      table.enu('career_path_candidate_status_history_from_status', ['propuesto', 'activo', 'rechazado', 'desactivado', 'expirado']).nullable()
      table.enu('career_path_candidate_status_history_to_status', ['propuesto', 'activo', 'rechazado', 'desactivado', 'expirado']).notNullable()
     
      table.text('career_path_candidate_status_history_reason').nullable()

      table.timestamp('career_path_candidate_status_history_created_at').notNullable()
      table.timestamp('career_path_candidate_status_history_updated_at').nullable()
      table.timestamp('career_path_candidate_status_history_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}