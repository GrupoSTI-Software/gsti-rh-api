import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Avance de subida por dispositivo y tabla (spec ADMS v2, 4.4 y 10). El valor es
 * el que el propio equipo declara en `Stamp=` y se devuelve en el saludo; `0` es
 * el estado inicial y la palanca experimental de re-subida.
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_stamps'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_stamp_id').notNullable()
      table
        .integer('access_point_id')
        .unsigned()
        .notNullable()
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('CASCADE')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
      table.string('access_point_stamp_table', 30).notNullable()
      table.string('access_point_stamp_value', 30).notNullable().defaultTo('0')
      table.timestamp('access_point_stamp_last_upload_at').nullable()
      table.integer('access_point_stamp_last_upload_lines').unsigned().nullable()
      table.timestamp('access_point_stamp_reset_at').nullable()
      table.integer('access_point_stamp_reset_by_user_id').unsigned().nullable()

      table.timestamp('access_point_stamp_created_at').notNullable().defaultTo(this.now())
      table.timestamp('access_point_stamp_updated_at').nullable()

      table.unique(['access_point_id', 'access_point_stamp_table'], 'uq_access_point_stamp_table')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
