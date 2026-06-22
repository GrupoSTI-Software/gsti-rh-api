import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_targets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_application_target_id').notNullable()

      table.integer('questionnaire_application_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()

      table
        .enum('questionnaire_application_target_status', ['pendiente', 'respondido'])
        .notNullable()
        .defaultTo('pendiente')
      table.timestamp('questionnaire_application_target_responded_at').nullable()

      table.timestamp('questionnaire_application_target_created_at').notNullable()
      table.timestamp('questionnaire_application_target_updated_at').notNullable()

      table
        .foreign('questionnaire_application_id', 'fk_qat_questionnaire_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('CASCADE')

      table
        .foreign('employee_id', 'fk_qat_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table.unique(['questionnaire_application_id', 'employee_id'], {
        indexName: 'uq_qat_application_employee',
      })
      table.index(
        ['questionnaire_application_id', 'questionnaire_application_target_status'],
        'idx_qat_application_status'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
