import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'attention_programs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('attention_program_id').notNullable()

      table.integer('business_unit_id').unsigned().notNullable()
      table.bigInteger('regulation_id').unsigned().notNullable()
      table.integer('questionnaire_application_id').unsigned().nullable()

      table.integer('attention_program_year').unsigned().notNullable()
      table.string('attention_program_period', 100).nullable()
      table
        .enum('attention_program_status', ['borrador', 'vigente', 'cerrado'])
        .notNullable()
        .defaultTo('borrador')

      table.timestamp('attention_program_created_at').notNullable()
      table.timestamp('attention_program_updated_at').notNullable()
      table.timestamp('attention_program_deleted_at').nullable()

      table
        .foreign('business_unit_id', 'fk_attention_program_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign('regulation_id', 'fk_attention_program_regulation')
        .references('regulation_id')
        .inTable('regulations')
        .onDelete('RESTRICT')

      table
        .foreign('questionnaire_application_id', 'fk_attention_program_questionnaire_application')
        .references('questionnaire_application_id')
        .inTable('questionnaire_applications')
        .onDelete('RESTRICT')

      table.index(['business_unit_id', 'attention_program_status'], 'idx_attention_program_scope_status')
      table.index(['business_unit_id', 'attention_program_year'], 'idx_attention_program_scope_year')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
