import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_clause_features'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_clause_feature_id').notNullable()

      table
        .bigInteger('regulation_clause_id')
        .unsigned()
        .notNullable()
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.string('regulation_clause_feature_slug', 100).notNullable()
      table.string('regulation_clause_feature_module', 100).notNullable()
      table
        .enum('regulation_clause_feature_status', [
          'planeado',
          'en_desarrollo',
          'disponible',
          'no_aplica',
        ])
        .notNullable()
      table.text('regulation_clause_feature_notes').nullable()
      table.string('regulation_clause_feature_available_since', 20).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
