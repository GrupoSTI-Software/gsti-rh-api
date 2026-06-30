import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_tabulation_employee_results'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_tabulation_employee_result_id').notNullable()
      table.integer('questionnaire_application_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.decimal('questionnaire_tabulation_employee_result_score', 10, 2).notNullable()
      table
        .enum('questionnaire_tabulation_employee_result_risk_level', [
          'nulo',
          'bajo',
          'medio',
          'alto',
          'muy_alto',
        ])
        .nullable()
      table.timestamp('questionnaire_tabulation_employee_result_created_at').notNullable()
      table.timestamp('questionnaire_tabulation_employee_result_updated_at').notNullable()

      table
        .foreign('questionnaire_application_id', 'fk_qter_questionnaire_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('CASCADE')

      table
        .foreign('employee_id', 'fk_qter_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table.unique(['questionnaire_application_id', 'employee_id'], {
        indexName: 'uq_qter_application_employee',
      })
      table.index(['questionnaire_application_id'], 'idx_qter_application')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
