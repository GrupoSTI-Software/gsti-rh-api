import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reemplaza la tabla regulation_clause_features (versión por slug) por una versión
 * con llave foránea a system_features. El up elimina la tabla previa y la recrea;
 * el down la restituye a su forma original (sin datos, tabla vacía en esta etapa).
 */
export default class extends BaseSchema {
  protected tableName = 'regulation_clause_features'

  async up() {
    this.schema.dropTable(this.tableName)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_clause_feature_id').notNullable()

      table
        .bigInteger('regulation_clause_id')
        .unsigned()
        .notNullable()
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.bigInteger('system_feature_id').unsigned().notNullable()
      table
        .foreign('system_feature_id', 'fk_rcf_system_feature_id')
        .references('system_feature_id')
        .inTable('system_features')
        .onDelete('RESTRICT')

      table
        .enum('regulation_clause_feature_coverage', ['total', 'parcial'])
        .nullable()

      table.string('regulation_clause_feature_note_key', 150).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(['regulation_clause_id', 'system_feature_id'], {
        indexName: 'uq_regulation_clause_features_clause_feature',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)

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
}
