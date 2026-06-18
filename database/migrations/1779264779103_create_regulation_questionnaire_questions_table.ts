import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_questionnaire_questions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_questionnaire_question_id').notNullable()

      table.bigInteger('regulation_questionnaire_section_id').unsigned().notNullable()
      table
        .foreign('regulation_questionnaire_section_id', 'fk_rqq_section_id')
        .references('regulation_questionnaire_section_id')
        .inTable('regulation_questionnaire_sections')
        .onDelete('RESTRICT')

      table.string('regulation_questionnaire_question_code', 20).notNullable()
      table.string('regulation_questionnaire_question_text_key', 150).notNullable()
      table.string('regulation_questionnaire_question_help_key', 150).nullable()

      table
        .bigInteger('regulation_questionnaire_question_answer_scale_id')
        .unsigned()
        .notNullable()
      table
        .foreign('regulation_questionnaire_question_answer_scale_id', 'fk_rqq_answer_scale_id')
        .references('regulation_questionnaire_answer_scale_id')
        .inTable('regulation_questionnaire_answer_scales')
        .onDelete('RESTRICT')

      table
        .tinyint('regulation_questionnaire_question_is_reverse_scored')
        .notNullable()
        .defaultTo(0)
      table
        .decimal('regulation_questionnaire_question_weight', 4, 2)
        .notNullable()
        .defaultTo(1.0)
      table.smallint('regulation_questionnaire_question_ord').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(
        ['regulation_questionnaire_section_id', 'regulation_questionnaire_question_code'],
        { indexName: 'uq_regulation_questionnaire_questions_section_code' }
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
