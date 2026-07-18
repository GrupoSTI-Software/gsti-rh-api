import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo global de categorías del buzón de quejas (NOM-035).
 * El texto visible se resuelve por i18n server-side; aquí solo slug, active y order.
 */
export default class extends BaseSchema {
  protected tableName = 'complaint_categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_category_id')
      table.string('complaint_category_slug', 100).notNullable().unique()
      table.tinyint('complaint_category_active').notNullable().defaultTo(1)
      table.integer('complaint_category_order').notNullable().defaultTo(0)
      table.timestamp('complaint_category_created_at').notNullable()
      table.timestamp('complaint_category_updated_at').notNullable()
      table.timestamp('complaint_category_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
