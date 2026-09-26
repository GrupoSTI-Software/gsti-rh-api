import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_tabulation_results'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_tabulation_result_id').notNullable()
      table.integer('questionnaire_application_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table
        .enum('questionnaire_tabulation_result_scope', ['overall', 'category', 'domain'])
        .notNullable()
      table.string('questionnaire_tabulation_result_target_code', 50).nullable()
      table.decimal('questionnaire_tabulation_result_score', 10, 2).notNullable()
      table
        .enum('questionnaire_tabulation_result_risk_level', ['nulo', 'bajo', 'medio', 'alto', 'muy_alto'])
        .nullable()
      table.smallint('questionnaire_tabulation_result_responders_count').unsigned().notNullable()
      table.timestamp('questionnaire_tabulation_result_computed_at').notNullable()
      table.timestamp('questionnaire_tabulation_result_created_at').notNullable()
      table.timestamp('questionnaire_tabulation_result_updated_at').notNullable()

      table
        .foreign('questionnaire_application_id', 'fk_qtr_questionnaire_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('CASCADE')

      table
        .foreign('business_unit_id', 'fk_qtr_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.unique(
        [
          'questionnaire_application_id',
          'questionnaire_tabulation_result_scope',
          'questionnaire_tabulation_result_target_code',
        ],
        { indexName: 'uq_qtr_application_scope_target' }
      )

      table.index(
        ['business_unit_id', 'questionnaire_tabulation_result_scope'],
        'idx_qtr_business_unit_scope'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
