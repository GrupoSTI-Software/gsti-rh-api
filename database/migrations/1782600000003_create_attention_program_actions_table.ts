import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'attention_program_actions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('attention_program_action_id').notNullable()

      table.integer('attention_program_id').unsigned().notNullable()
      table.integer('psychosocial_dimension_id').unsigned().notNullable()
      table.integer('attention_action_level_id').unsigned().notNullable()

      table.text('attention_program_action_target').notNullable()
      table.text('attention_program_action_description').notNullable()
      table.date('attention_program_action_start_date').notNullable()
      table.date('attention_program_action_end_date').notNullable()
      table.text('attention_program_action_progress').notNullable()
      table.text('attention_program_action_evaluation').notNullable()
      table.string('attention_program_action_responsible', 150).notNullable()
      table
        .enum('attention_program_action_status', ['pendiente', 'en-curso', 'cumplida'])
        .notNullable()
        .defaultTo('pendiente')

      table.timestamp('attention_program_action_created_at').notNullable()
      table.timestamp('attention_program_action_updated_at').notNullable()
      table.timestamp('attention_program_action_deleted_at').nullable()

      table
        .foreign('attention_program_id', 'fk_apa_attention_program')
        .references('attention_program_id')
        .inTable('attention_programs')
        .onDelete('CASCADE')

      table
        .foreign('psychosocial_dimension_id', 'fk_apa_psychosocial_dimension')
        .references('psychosocial_dimension_id')
        .inTable('psychosocial_dimensions')
        .onDelete('RESTRICT')

      table
        .foreign('attention_action_level_id', 'fk_apa_attention_action_level')
        .references('attention_action_level_id')
        .inTable('attention_action_levels')
        .onDelete('RESTRICT')

      table.index(
        ['attention_program_id', 'psychosocial_dimension_id'],
        'idx_apa_program_dimension'
      )
      table.index(
        ['attention_program_id', 'attention_action_level_id'],
        'idx_apa_program_action_level'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
