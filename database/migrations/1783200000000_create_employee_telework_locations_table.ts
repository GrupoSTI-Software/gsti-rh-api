import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lugar(es) donde labora el teletrabajador — NOM-037 numeral 5.1.
 *
 * Relación 1:N con `employees`: un teletrabajador puede tener varios lugares
 * acordados; `is_fixed_agreed` marca el lugar fijo pactado (5.1.2) y los
 * campos de conectividad cubren el 5.1.1 (internet, equipo).
 *
 * La dirección es un snapshot propio (subset del patrón `addresses` del
 * repo): el lugar pactado no debe mutar si el domicilio personal cambia.
 *
 * Multi-tenant: `business_unit_id` aísla por empresa (withBusinessUnitScope).
 * Baja lógica con `employee_telework_location_deleted_at` (auditoría).
 *
 * Ver `docs/spec-USRH1782792802405.md` §3.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_telework_locations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('employee_telework_location_id').notNullable()

      // FK sin cascada: los lugares dados de baja se conservan aunque se
      // dé de baja el empleado (valor probatorio ante inspección STPS).
      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      table
        .enum('employee_telework_location_type', ['home', 'coworking', 'other'])
        .notNullable()
        .defaultTo('home')

      // Dirección del lugar (snapshot propio; campos NOT NULL = mínimos del 5.1)
      table.string('employee_telework_location_street', 200).notNullable()
      table.string('employee_telework_location_external_number', 50).nullable()
      table.string('employee_telework_location_internal_number', 50).nullable()
      table.string('employee_telework_location_settlement', 150).nullable()
      table.string('employee_telework_location_city', 150).notNullable()
      table.string('employee_telework_location_state', 150).notNullable()
      table.string('employee_telework_location_country', 100).notNullable().defaultTo('México')
      table.string('employee_telework_location_zipcode', 10).nullable()

      // Fijeza 5.1.2: el lugar es el sitio fijo pactado, no itinerante.
      // Invariante "máximo un fijo activo por empleado" se garantiza en el
      // servicio (un unique index no convive con soft deletes en MySQL).
      table.boolean('employee_telework_location_is_fixed_agreed').notNullable().defaultTo(false)

      // Conectividad 5.1.1 — campos mínimos de la HU; [VALIDAR] contra el
      // Apéndice de la NOM-037 (extensible sin migración destructiva).
      table.boolean('employee_telework_location_has_internet').notNullable().defaultTo(false)
      table
        .boolean('employee_telework_location_has_adequate_equipment')
        .notNullable()
        .defaultTo(false)
      table.string('employee_telework_location_connectivity_notes', 500).nullable()

      table.boolean('employee_telework_location_active').notNullable().defaultTo(true)

      table.timestamp('employee_telework_location_created_at').notNullable()
      table.timestamp('employee_telework_location_updated_at').nullable()
      table.timestamp('employee_telework_location_deleted_at').nullable()

      table
        .foreign('employee_id', 'fk_etl_employee')
        .references('employees.employee_id')
        .onDelete('RESTRICT')
      table
        .foreign('business_unit_id', 'fk_etl_business_unit')
        .references('business_units.business_unit_id')

      table.index(['employee_id'], 'idx_etl_employee')
      table.index(['business_unit_id', 'employee_id'], 'idx_etl_bu_employee')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
