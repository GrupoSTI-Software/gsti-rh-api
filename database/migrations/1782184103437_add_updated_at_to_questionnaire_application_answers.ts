import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_application_answers'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .timestamp('questionnaire_application_answer_updated_at')
        .nullable()
        .after('questionnaire_application_answer_created_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('questionnaire_application_answer_updated_at')
    })
  }
}
