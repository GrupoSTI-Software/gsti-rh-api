import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'questionnaire_applications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('questionnaire_application_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('branch_office_id').unsigned().notNullable()
      table.bigInteger('regulation_questionnaire_id').unsigned().notNullable()

      table.string('questionnaire_application_folio', 50).notNullable()
      table
        .enum('questionnaire_application_instrument', ['guide_ii', 'guide_iii'])
        .notNullable()
      table
        .enum('questionnaire_application_status', ['borrador', 'en-curso', 'cerrada'])
        .notNullable()
        .defaultTo('en-curso')
      table.timestamp('questionnaire_application_launched_at').notNullable()
      table.timestamp('questionnaire_application_closed_at').nullable()

      table.timestamp('questionnaire_application_created_at').notNullable()
      table.timestamp('questionnaire_application_updated_at').notNullable()
      table.timestamp('questionnaire_application_deleted_at').nullable()

      table
        .foreign('business_unit_id', 'fk_qa_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign('branch_office_id', 'fk_qa_branch_office')
        .references('branch_office_id')
        .inTable('branch_offices')
        .onDelete('RESTRICT')

      table
        .foreign('regulation_questionnaire_id', 'fk_qa_regulation_questionnaire')
        .references('regulation_questionnaire_id')
        .inTable('regulation_questionnaires')
        .onDelete('RESTRICT')

      table.unique(['questionnaire_application_folio'], {
        indexName: 'uq_qa_folio',
      })

      table.index(
        ['business_unit_id', 'branch_office_id', 'questionnaire_application_status'],
        'idx_qa_scope_branch_status'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
