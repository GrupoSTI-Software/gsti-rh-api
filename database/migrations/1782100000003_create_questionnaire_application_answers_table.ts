import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_answers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_application_answer_id').notNullable()

      table.integer('questionnaire_application_response_id').unsigned().notNullable()
      table.bigInteger('regulation_questionnaire_question_id').unsigned().notNullable()

      table.string('questionnaire_application_answer_option_key', 100).notNullable()
      table.smallint('questionnaire_application_answer_value').notNullable()

      table.timestamp('questionnaire_application_answer_created_at').notNullable()

      table
        .foreign('questionnaire_application_response_id', 'fk_qaa_questionnaire_response')
        .references('questionnaire_application_response_id')
        .inTable('questionnaire_application_responses')
        .onDelete('CASCADE')

      table
        .foreign('regulation_questionnaire_question_id', 'fk_qaa_regulation_question')
        .references('regulation_questionnaire_question_id')
        .inTable('regulation_questionnaire_questions')
        .onDelete('RESTRICT')

      table.unique(
        ['questionnaire_application_response_id', 'regulation_questionnaire_question_id'],
        {
          indexName: 'uq_qaa_response_question',
        }
      )
      table.index(['regulation_questionnaire_question_id'], 'idx_qaa_question')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
