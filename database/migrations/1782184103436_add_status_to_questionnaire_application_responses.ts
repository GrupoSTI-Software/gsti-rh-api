import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_responses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enu('questionnaire_application_response_status', ['borrador', 'respondido'])
        .notNullable()
        .defaultTo('borrador')
        .after('questionnaire_application_response_answered_count')

      table.timestamp('questionnaire_application_response_submitted_at').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('questionnaire_application_response_status')
      table.timestamp('questionnaire_application_response_submitted_at').notNullable().alter()
    })
  }
}
