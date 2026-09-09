import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Zona horaria de la sede y del dispositivo, CIDR permitidos por punto de acceso
 * y metodo de verificacion por checada (spec ADMS v2, secciones 5.1, 5.3, 4.2 y 10).
 *
 * `business_unit_timezone` NOT NULL con default: el canal nunca retiene el acuse
 * por configuracion de zona (spec 15). `access_point_timezone` es override.
 * `assist_verify_method` solo la llena el canal ADMS (1 huella, 15 rostro).
 *
 * Tres `alterTable` sin `await`: Lucid los encola y ejecuta una sola vez.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('business_units', (table) => {
      table
        .string('business_unit_timezone', 64)
        .notNullable()
        .defaultTo('America/Mexico_City')
        .after('business_unit_has_biometrics')
    })

    this.schema.alterTable('access_points', (table) => {
      table.string('access_point_timezone', 64).nullable().after('access_point_last_connection')
      table.json('access_point_allowed_cidrs').nullable().after('access_point_timezone')
    })

    this.schema.alterTable('assists', (table) => {
      table.tinyint('assist_verify_method').unsigned().nullable().after('assist_origin')
    })
  }

  async down() {
    this.schema.alterTable('assists', (table) => {
      table.dropColumn('assist_verify_method')
    })
    this.schema.alterTable('access_points', (table) => {
      table.dropColumn('access_point_allowed_cidrs')
      table.dropColumn('access_point_timezone')
    })
    this.schema.alterTable('business_units', (table) => {
      table.dropColumn('business_unit_timezone')
    })
  }
}
