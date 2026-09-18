import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retira el CSV `shift_business_units` de `shifts`.
 *
 * Era un espejo denormalizado de la empresa dueña, escrito como lista de slugs.
 * Desde `1783300000030` el turno tiene `business_unit_id` y el mixin
 * `withBusinessUnitScope()` gobierna el aislamiento con esa llave, así que el
 * CSV ya no decidía nada — solo podía discrepar.
 *
 * Y discrepaba: el import de empleados buscaba el `business_unit_id` DENTRO del
 * CSV (`employee_service`), pero el CSV se escribía con slugs, de modo que esa
 * comparación no acertaba nunca y el turno se elegía por nombre sin mirar la
 * empresa. Al pasar la comparación a la llave, el caso se arregla solo.
 *
 * `down()` la repone vacía: su contenido se deriva de `business_unit_id` y
 * reconstruirlo sería inventar una verdad que ya vive en otro lado.
 */

const TABLE = 'shifts'
const COLUMN = 'shift_business_units'

type CountRow = { cnt: number }

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.dropColumn(COLUMN)
    })
  }

  async down() {
    this.defer(async (db) => {
      const [rows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [TABLE, COLUMN]
      )

      if ((rows[0]?.cnt ?? 0) > 0) {
        return
      }

      await db.rawQuery(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${COLUMN}\` VARCHAR(255) NULL`)
    })
  }
}
