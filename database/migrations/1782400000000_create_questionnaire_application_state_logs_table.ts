import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora inmutable de transiciones de estado para rondas NOM-035.
 *
 * Convenciones:
 * - Tabla plural con prefijo de columnas.
 * - Registro append-only: solo created_at.
 * - Se relaciona al actor con actor_user_id (misma convención del módulo de quejas).
 */
export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_state_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_application_state_log_id').notNullable()
      table.integer('questionnaire_application_id').unsigned().notNullable()
      table.integer('actor_user_id').unsigned().notNullable()

      table
        .enum('questionnaire_application_state_log_from_status', ['borrador', 'en-curso', 'cerrada'])
        .notNullable()
      table
        .enum('questionnaire_application_state_log_to_status', ['borrador', 'en-curso', 'cerrada'])
        .notNullable()

      table.text('questionnaire_application_state_log_note').notNullable()
      table.timestamp('questionnaire_application_state_log_created_at').notNullable()

      table
        .foreign('questionnaire_application_id', 'fk_qa_state_log_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('CASCADE')

      table
        .foreign('actor_user_id', 'fk_qa_state_log_actor_user')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(
        ['questionnaire_application_id', 'questionnaire_application_state_log_created_at'],
        'idx_qa_state_log_timeline'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
