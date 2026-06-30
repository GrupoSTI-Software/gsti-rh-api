import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'attention_action_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('attention_action_level_id').notNullable()
      table.bigInteger('regulation_id').unsigned().notNullable()
      table.bigInteger('regulation_clause_id').unsigned().nullable()

      table.string('attention_action_level_code', 50).notNullable()
      table.string('attention_action_level_name_key', 200).notNullable()
      table.integer('attention_action_level_order').unsigned().notNullable()

      table.timestamp('attention_action_level_created_at').notNullable()
      table.timestamp('attention_action_level_updated_at').notNullable()
      table.timestamp('attention_action_level_deleted_at').nullable()

      table
        .foreign('regulation_id', 'fk_aal_regulation')
        .references('regulation_id')
        .inTable('regulations')
        .onDelete('RESTRICT')

      table
        .foreign('regulation_clause_id', 'fk_aal_regulation_clause')
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.unique(['attention_action_level_code'], { indexName: 'uq_aal_code' })
      table.unique(['regulation_id', 'attention_action_level_order'], { indexName: 'uq_aal_reg_order' })
      table.index(['regulation_id'], 'idx_aal_regulation')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
