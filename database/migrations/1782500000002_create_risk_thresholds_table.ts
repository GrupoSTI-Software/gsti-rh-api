import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'risk_thresholds'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('risk_threshold_id').notNullable()
      table.bigInteger('regulation_questionnaire_id').unsigned().notNullable()
      table.enum('risk_threshold_scope', ['overall', 'category', 'domain']).notNullable()
      table.string('risk_threshold_target_code', 50).nullable()
      table
        .enum('risk_threshold_level', ['nulo', 'bajo', 'medio', 'alto', 'muy_alto'])
        .notNullable()
      table.integer('risk_threshold_min').notNullable()
      table.integer('risk_threshold_max').notNullable()
      table.smallint('risk_threshold_ord').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table
        .foreign('regulation_questionnaire_id', 'fk_risk_thresholds_questionnaire_id')
        .references('regulation_questionnaire_id')
        .inTable('regulation_questionnaires')
        .onDelete('RESTRICT')

      table.unique(
        [
          'regulation_questionnaire_id',
          'risk_threshold_scope',
          'risk_threshold_target_code',
          'risk_threshold_level',
        ],
        { indexName: 'uq_risk_thresholds_scope_target_level' }
      )
      table.index(
        [
          'regulation_questionnaire_id',
          'risk_threshold_scope',
          'risk_threshold_target_code',
          'risk_threshold_min',
          'risk_threshold_max',
        ],
        'idx_risk_thresholds_lookup'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
