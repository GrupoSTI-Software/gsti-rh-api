import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_responses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_application_response_id').notNullable()

      table.integer('questionnaire_application_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()

      table.smallint('questionnaire_application_response_answered_count').notNullable()
      table.timestamp('questionnaire_application_response_submitted_at').notNullable()

      table.timestamp('questionnaire_application_response_created_at').notNullable()
      table.timestamp('questionnaire_application_response_updated_at').notNullable()
      table.timestamp('questionnaire_application_response_deleted_at').nullable()

      table
        .foreign('questionnaire_application_id', 'fk_qar_questionnaire_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('CASCADE')

      table
        .foreign('employee_id', 'fk_qar_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table.unique(['questionnaire_application_id', 'employee_id'], {
        indexName: 'uq_qar_application_employee',
      })
      table.index(['questionnaire_application_id'], 'idx_qar_application')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
