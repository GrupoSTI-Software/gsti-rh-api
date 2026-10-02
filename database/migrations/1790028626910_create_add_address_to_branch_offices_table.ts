import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Domicilio de la sucursal, en campos separados.
 *
 * `branch_office_location_address` no es un domicilio: guarda el GeoJSON de la
 * geocerca que se dibuja en el mapa, con el mismo criterio que `zone_polygon`.
 * Nunca sirvió para decir dónde está la sucursal, y el domicilio se necesita
 * legible para imprimirlo en los documentos del personal asignado.
 *
 * Las columnas son nullable y el domicilio es opcional de punta a punta: las
 * sucursales que ya existen —incluida la "Oficina principal" que siembra el
 * alta de cada empresa— no tienen domicilio que copiar, y capturarlo no es
 * condición para operar la sucursal. Se completa cuando se tenga.
 *
 * La columna de la geocerca se conserva: hoy no la consume ninguna lógica,
 * pero es la que usará la validación de asistencia en sitio.
 */

const TABLE = 'branch_offices'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.string('branch_office_street', 255).nullable()
      table.string('branch_office_settlement', 150).nullable()
      table.string('branch_office_zipcode', 10).nullable()
      table.string('branch_office_city', 150).nullable()
      table.string('branch_office_state', 150).nullable()
    })
  }

  async down() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn('branch_office_street')
      table.dropColumn('branch_office_settlement')
      table.dropColumn('branch_office_zipcode')
      table.dropColumn('branch_office_city')
      table.dropColumn('branch_office_state')
    })
  }
}
