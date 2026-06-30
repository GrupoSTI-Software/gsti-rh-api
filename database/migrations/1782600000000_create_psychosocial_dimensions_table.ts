import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'psychosocial_dimensions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('psychosocial_dimension_id').notNullable()
      table.bigInteger('regulation_id').unsigned().notNullable()
      table.bigInteger('regulation_clause_id').unsigned().nullable()

      table.string('psychosocial_dimension_code', 80).notNullable()
      table.string('psychosocial_dimension_name_key', 200).notNullable()
      table.integer('psychosocial_dimension_ord').unsigned().notNullable()

      table.timestamp('psychosocial_dimension_created_at').notNullable()
      table.timestamp('psychosocial_dimension_updated_at').notNullable()
      table.timestamp('psychosocial_dimension_deleted_at').nullable()

      table
        .foreign('regulation_id', 'fk_psd_regulation')
        .references('regulation_id')
        .inTable('regulations')
        .onDelete('RESTRICT')

      table
        .foreign('regulation_clause_id', 'fk_psd_regulation_clause')
        .references('regulation_clause_id')
        .inTable('regulation_clauses')
        .onDelete('RESTRICT')

      table.unique(['psychosocial_dimension_code'], { indexName: 'uq_psd_code' })
      table.unique(['regulation_id', 'psychosocial_dimension_ord'], { indexName: 'uq_psd_reg_ord' })
      table.index(['regulation_id'], 'idx_psd_regulation')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
