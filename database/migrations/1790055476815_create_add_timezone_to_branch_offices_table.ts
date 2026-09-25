import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Zona horaria de la sucursal.
 *
 * La asistencia se evalúa en la hora del sitio donde se trabaja el turno, y una
 * empresa puede tener sedes en zonas distintas (matriz en Ciudad de México y
 * planta en Ciudad Juárez). La cadena de resolución es sucursal, luego empresa
 * (`business_unit_timezone`), luego sistema.
 *
 * Nullable a propósito: una sucursal sin zona propia hereda la de su empresa,
 * que ya tiene default, así que las sucursales existentes no cambian de hora.
 * Identificador IANA, mismo formato que `business_unit_timezone`.
 */

const TABLE = 'branch_offices'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.string('branch_office_timezone', 64).nullable().after('branch_office_state')
    })
  }

  async down() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn('branch_office_timezone')
    })
  }
}
