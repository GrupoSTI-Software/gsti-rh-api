import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Expediente de salida por colaborador (USRH1786568279587): contenedor con
 * fecha tentativa, nota, origen y estado, del que cuelgan los pendientes de
 * `employee_offboarding_items`.
 *
 * `business_unit_id` es SNAPSHOT del colaborador al abrir (§7 D2): el
 * expediente sigue siendo localizable por su empresa aunque el colaborador
 * ya esté dado de baja. `employee_offboarding_closed_at`, `_closed_by_user_id`
 * y el estado 'closed' nacen aquí pero solo los escribe USRH1786568279596.
 *
 * `employee_offboarding_opened_by_user_id` es nullable a propósito
 * (desviación declarada del diccionario, escalada a Wilvardo): en la
 * apertura automática desde piloto/sobrecargo no hay usuario resuelto.
 *
 * Sin índice único de "un expediente abierto por colaborador": MySQL no
 * soporta índices únicos parciales y la tabla lleva borrado lógico. La
 * invariante vive en el servicio, con lock sobre la fila de `employees`
 * (§7 D6), nunca sobre un rango vacío de esta tabla.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboardings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_offboarding_id').notNullable()

      table.integer('employee_id').unsigned().notNullable()
      table.foreign('employee_id', 'fk_emp_offb_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table.integer('business_unit_id').unsigned().notNullable()
      table.foreign('business_unit_id', 'fk_emp_offb_bu')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.date('employee_offboarding_planned_date').nullable()

      // 'open' | 'closed' — string, no enum: el conjunto vive en el slice
      table.string('employee_offboarding_status', 20).notNullable().defaultTo('open')
      // 'scheduled' | 'termination' — distingue salidas preparadas de las registradas al dar de baja
      table.string('employee_offboarding_origin', 20).notNullable().defaultTo('scheduled')

      table.text('employee_offboarding_notes').nullable()

      table.integer('employee_offboarding_opened_by_user_id').unsigned().nullable()
      table.foreign('employee_offboarding_opened_by_user_id', 'fk_emp_offb_opened_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.integer('employee_offboarding_closed_by_user_id').unsigned().nullable()
      table.foreign('employee_offboarding_closed_by_user_id', 'fk_emp_offb_closed_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.datetime('employee_offboarding_closed_at').nullable()

      table.datetime('employee_offboarding_created_at').notNullable()
      table.datetime('employee_offboarding_updated_at').nullable()
      table.datetime('employee_offboarding_deleted_at').nullable()

      table.index(
        ['employee_id', 'employee_offboarding_status', 'employee_offboarding_deleted_at'],
        'idx_emp_offb_employee_status'
      )
      table.index(
        ['business_unit_id', 'employee_offboarding_status'],
        'idx_emp_offb_bu_status'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
