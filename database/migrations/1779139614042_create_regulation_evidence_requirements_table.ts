import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_evidence_requirements'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_evidence_requirement_id').notNullable()

      table
        .bigInteger('regulation_clause_id')
        .unsigned()
        .notNullable()
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table
        .enum('regulation_evidence_requirement_type', [
          'documento',
          'registro',
          'bitacora',
          'reporte',
          'formulario',
        ])
        .notNullable()
      table.string('regulation_evidence_requirement_description_key', 150).notNullable()
      table.tinyint('regulation_evidence_requirement_retention_years').unsigned().notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
