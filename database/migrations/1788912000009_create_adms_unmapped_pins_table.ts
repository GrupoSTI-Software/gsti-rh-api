import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * PINs que el checador reporta y que no corresponden a ningun colaborador
 * (spec v2, 9.4). Una fila por (dispositivo, PIN); el nombre que el equipo
 * declara va cifrado y se borra al resolver.
 *
 * Lleva `business_unit_id` aunque el spec no lo liste: la lista se consulta
 * desde el Backoffice de una empresa y sin la columna la ruta no podria
 * acotarla.
 */
export default class extends BaseSchema {
  protected tableName = 'adms_unmapped_pins'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('adms_unmapped_pin_id').notNullable()
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

      table.string('adms_unmapped_pin_pin', 20).notNullable()
      table.string('adms_unmapped_pin_name', 500).nullable()
      table.timestamp('adms_unmapped_pin_first_seen_at').notNullable()
      table.timestamp('adms_unmapped_pin_last_seen_at').notNullable()
      table.integer('adms_unmapped_pin_punch_count').unsigned().notNullable().defaultTo(0)
      table.json('adms_unmapped_pin_bio_types_seen').nullable()
      table
        .enum('adms_unmapped_pin_status', ['pending', 'linked', 'dismissed'])
        .notNullable()
        .defaultTo('pending')
      table.string('adms_unmapped_pin_dismiss_reason', 255).nullable()
      table.integer('linked_employee_id').unsigned().nullable()
      table.integer('adms_unmapped_pin_resolved_by_user_id').unsigned().nullable()
      table.timestamp('adms_unmapped_pin_resolved_at').nullable()

      table.timestamp('adms_unmapped_pin_created_at').notNullable().defaultTo(this.now())
      table.timestamp('adms_unmapped_pin_updated_at').nullable()

      table.unique(['access_point_id', 'adms_unmapped_pin_pin'], 'uq_adms_unmapped_pin_identity')
      table.index(
        ['business_unit_id', 'adms_unmapped_pin_status'],
        'idx_adms_unmapped_pin_bu_status'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
