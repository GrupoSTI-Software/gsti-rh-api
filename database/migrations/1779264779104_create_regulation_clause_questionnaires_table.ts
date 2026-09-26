import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_clause_questionnaires'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_clause_questionnaire_id').notNullable()

      table
        .bigInteger('regulation_clause_id')
        .unsigned()
        .notNullable()
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.bigInteger('regulation_questionnaire_id').unsigned().notNullable()
      table
        .foreign('regulation_questionnaire_id', 'fk_rcq_questionnaire_id')
        .references('regulation_questionnaire_id')
        .inTable('regulation_questionnaires')
        .onDelete('RESTRICT')

      table.text('regulation_clause_questionnaire_notes').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(
        ['regulation_clause_id', 'regulation_questionnaire_id'],
        { indexName: 'uq_regulation_clause_questionnaires_clause_questionnaire' }
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
