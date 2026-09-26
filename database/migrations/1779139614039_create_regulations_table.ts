import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'regulations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('regulation_id').notNullable()

      table
        .bigInteger('regulatory_authority_id')
        .unsigned()
        .notNullable()
        .references('regulatory_authority_id')
        .inTable('regulatory_authorities')
        .onDelete('RESTRICT')

      table.string('regulation_code', 100).notNullable()
      table.string('regulation_title', 500).notNullable()
      table
        .enum('regulation_type', ['NOM', 'NMX', 'LEY', 'REGLAMENTO', 'ACUERDO', 'RESOLUCION'])
        .notNullable()
      table.string('regulation_version', 20).notNullable()
      table.date('regulation_publication_date').notNullable()
      table.date('regulation_effective_date').notNullable()
      table.date('regulation_last_revision_date').nullable()
      table.enum('regulation_status', ['vigente', 'modificada', 'derogada']).notNullable()
      table.string('regulation_scope_description_key', 150).nullable()
      table.string('regulation_general_audit_description_key', 150).nullable()
      table.string('regulation_official_url', 500).nullable()
      table.text('regulation_internal_notes').nullable()
      table.tinyint('regulation_retention_min_years').unsigned().nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.unique(['regulatory_authority_id', 'regulation_code', 'regulation_version'], {
        indexName: 'uq_regulations_authority_code_version',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
