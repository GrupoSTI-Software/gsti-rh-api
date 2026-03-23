import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Asegura que proceeding_file_type_area_to_use acepte valores como system-setting
 * sin depender de listas ENUM rígidas en MySQL.
 */
export default class extends BaseSchema {
  protected tableName = 'proceeding_file_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('proceeding_file_type_area_to_use', 100).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('proceeding_file_type_area_to_use', 100).notNullable().alter()
    })
  }
}
