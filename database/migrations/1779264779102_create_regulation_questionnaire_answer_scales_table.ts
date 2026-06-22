import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulation_questionnaire_answer_scales'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_questionnaire_answer_scale_id').notNullable()

      table.string('regulation_questionnaire_answer_scale_code', 50).notNullable()
      table.unique(['regulation_questionnaire_answer_scale_code'], {
        indexName: 'uq_rqas_code',
      })
      table.string('regulation_questionnaire_answer_scale_title_key', 150).notNullable()
      table.json('regulation_questionnaire_answer_scale_definition').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
