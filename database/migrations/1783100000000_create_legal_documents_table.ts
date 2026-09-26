import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'legal_documents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('legal_document_id')

      table
        .enum('legal_document_type', ['privacy_notice', 'terms_conditions', 'biometric_consent'])
        .notNullable()
      table.string('legal_document_version', 20).notNullable()
      table.text('legal_document_content', 'longtext').nullable()
      table.boolean('legal_document_is_current').notNullable().defaultTo(false)
      table.enum('legal_document_status', ['draft', 'published']).notNullable().defaultTo('draft')
      table.timestamp('legal_document_published_at').nullable()

      table.integer('legal_document_published_by_user_id').unsigned().nullable()
      table
        .foreign('legal_document_published_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('legal_document_created_at').notNullable()
      table.timestamp('legal_document_updated_at').nullable()

      table.unique(['legal_document_type', 'legal_document_version'], {
        indexName: 'legal_documents_type_version_unique',
      })
      table.index(
        ['legal_document_type', 'legal_document_is_current'],
        'legal_documents_type_current_index'
      )
      table.index(['legal_document_status'], 'legal_documents_status_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
