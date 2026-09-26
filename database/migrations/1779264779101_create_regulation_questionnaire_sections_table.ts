import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_questionnaire_sections'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_questionnaire_section_id').notNullable()

      table.bigInteger('regulation_questionnaire_id').unsigned().notNullable()
      table
        .foreign('regulation_questionnaire_id', 'fk_rqs_questionnaire_id')
        .references('regulation_questionnaire_id')
        .inTable('regulation_questionnaires')
        .onDelete('RESTRICT')

      table.string('regulation_questionnaire_section_code', 50).notNullable()
      table.string('regulation_questionnaire_section_title_key', 150).notNullable()
      table.string('regulation_questionnaire_section_description_key', 150).nullable()
      table.smallint('regulation_questionnaire_section_ord').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(
        ['regulation_questionnaire_id', 'regulation_questionnaire_section_code'],
        { indexName: 'uq_regulation_questionnaire_sections_questionnaire_code' }
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
