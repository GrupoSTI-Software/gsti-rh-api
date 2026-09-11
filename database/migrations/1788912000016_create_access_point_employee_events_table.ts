import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Historial del pivote empleado por dispositivo (spec ADMS 8.1).
 *
 * Guarda POR QUE cambio cada cosa: quien fijo un PIN, cual era el anterior,
 * quien pidio el envio o la revocacion. Cuando una checada acaba en la persona
 * equivocada, esta tabla es la que dice cuando se reciclo ese PIN.
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_employee_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('access_point_employee_event_id').notNullable()
      table
        .integer('access_point_employee_id')
        .unsigned()
        .notNullable()
        .references('access_point_employee_id')
        .inTable('access_point_employees')
        .onDelete('CASCADE')
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.string('access_point_employee_event_kind', 30).notNullable()
      table.string('access_point_employee_event_from_status', 20).nullable()
      table.string('access_point_employee_event_to_status', 20).nullable()
      table.string('access_point_employee_event_from_pin', 20).nullable()
      table.string('access_point_employee_event_to_pin', 20).nullable()
      table.integer('access_point_employee_event_actor_user_id').unsigned().nullable()
      table.integer('device_command_id').unsigned().nullable()
      table.string('access_point_employee_event_detail', 255).nullable()

      table.timestamp('access_point_employee_event_created_at').notNullable().defaultTo(this.now())
      table.timestamp('access_point_employee_event_updated_at').nullable()

      table.index(
        ['access_point_employee_id', 'access_point_employee_event_created_at'],
        'idx_access_point_employee_event_history'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
