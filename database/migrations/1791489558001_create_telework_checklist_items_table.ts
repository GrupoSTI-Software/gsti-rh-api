import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo global de puntos (reactivos) de la lista de verificación de
 * teletrabajo (VLRH-H1790812613870).
 *
 * Tabla global (sin `business_unit_id` y sin mixin de tenant): los puntos son
 * los mismos para todas las empresas. Sin soft delete: un punto no se borra,
 * se desactiva con `telework_checklist_item_is_active = false`.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_checklist_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_checklist_item_id').notNullable()
      table.string('telework_checklist_item_code', 50).notNullable()
      table.string('telework_checklist_item_label_key', 150).notNullable()
      table.smallint('telework_checklist_item_order').unsigned().notNullable()
      table.boolean('telework_checklist_item_is_active').notNullable().defaultTo(true)
      table.timestamp('telework_checklist_item_created_at').notNullable()
      table.timestamp('telework_checklist_item_updated_at').nullable()

      table.unique(['telework_checklist_item_code'], { indexName: 'uq_twci_code' })
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
