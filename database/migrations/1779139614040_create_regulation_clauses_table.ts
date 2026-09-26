import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_clauses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_clause_id').notNullable()

      table
        .bigInteger('regulation_id')
        .unsigned()
        .notNullable()
        .references('regulation_id')
        .inTable('regulations')
        .onDelete('RESTRICT')

      table
        .bigInteger('parent_regulation_clause_id')
        .unsigned()
        .nullable()
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.string('regulation_clause_code', 20).notNullable()
      table.smallint('regulation_clause_ord').notNullable()
      table.string('regulation_clause_title_key', 150).nullable()
      table.string('regulation_clause_obligation_key', 150).notNullable()
      table.string('regulation_clause_explanation_key', 150).notNullable()
      table.string('regulation_clause_rationale_key', 150).notNullable()
      table.string('regulation_clause_audit_criteria_key', 150).notNullable()
      table.string('regulation_clause_applicability_key', 150).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(['regulation_id', 'regulation_clause_code'], {
        indexName: 'uq_regulation_clauses_regulation_code',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
