import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_questionnaires'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_questionnaire_id').notNullable()

      table
        .bigInteger('regulatory_authority_id')
        .unsigned()
        .notNullable()
        .references('regulatory_authority_id')
        .inTable('regulatory_authorities')
        .onDelete('RESTRICT')

      table.string('regulation_questionnaire_code', 100).notNullable()
      table.string('regulation_questionnaire_title_key', 150).notNullable()
      table.string('regulation_questionnaire_description_key', 150).notNullable()
      table.string('regulation_questionnaire_version', 20).notNullable()
      table
        .enum('regulation_questionnaire_status', ['vigente', 'modificada', 'derogada'])
        .notNullable()
        .defaultTo('vigente')
      table.string('regulation_questionnaire_applies_to_description_key', 150).nullable()
      table.smallint('regulation_questionnaire_min_responders').unsigned().nullable()
      table.smallint('regulation_questionnaire_completion_time_minutes').unsigned().nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(
        ['regulatory_authority_id', 'regulation_questionnaire_code', 'regulation_questionnaire_version'],
        { indexName: 'uq_regulation_questionnaires_authority_code_version' }
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
