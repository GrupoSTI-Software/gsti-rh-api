import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'risk_domains'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('risk_domain_id').notNullable()
      table.bigInteger('regulation_questionnaire_id').unsigned().notNullable()
      table.string('risk_domain_code', 50).notNullable()
      table.string('risk_domain_name_key', 150).notNullable()
      table.string('risk_domain_category_section_code', 50).notNullable()
      table.smallint('risk_domain_ord').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table
        .foreign('regulation_questionnaire_id', 'fk_risk_domains_questionnaire_id')
        .references('regulation_questionnaire_id')
        .inTable('regulation_questionnaires')
        .onDelete('RESTRICT')

      table.unique(['regulation_questionnaire_id', 'risk_domain_code'], {
        indexName: 'uq_risk_domains_questionnaire_code',
      })

      table.index(
        ['regulation_questionnaire_id', 'risk_domain_category_section_code'],
        'idx_risk_domains_questionnaire_category'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
