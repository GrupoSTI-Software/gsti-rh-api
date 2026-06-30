import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'risk_domain_questions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('risk_domain_question_id').notNullable()
      table.bigInteger('risk_domain_id').unsigned().notNullable()
      table.bigInteger('regulation_questionnaire_question_id').unsigned().notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table
        .foreign('risk_domain_id', 'fk_risk_domain_questions_domain_id')
        .references('risk_domain_id')
        .inTable('risk_domains')
        .onDelete('CASCADE')

      table
        .foreign('regulation_questionnaire_question_id', 'fk_risk_domain_questions_question_id')
        .references('regulation_questionnaire_question_id')
        .inTable('regulation_questionnaire_questions')
        .onDelete('RESTRICT')

      table.unique(['risk_domain_id', 'regulation_questionnaire_question_id'], {
        indexName: 'uq_rdq_domain_question',
      })
      table.index(['regulation_questionnaire_question_id'], 'idx_rdq_question')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
