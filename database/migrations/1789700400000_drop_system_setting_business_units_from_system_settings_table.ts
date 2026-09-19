import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retira el CSV `system_setting_business_units` de `system_settings`.
 *
 * Era la forma de decir de qué empresas era una configuración cuando la tabla
 * no tenía dueño. Desde `1783968970000` lo dice `business_unit_id`, y la
 * configuración pertenece a UNA empresa, así que la lista nunca tuvo más de un
 * elemento real: mantener las dos fuentes solo permitía que discreparan.
 *
 * Al retirarlo salieron a la luz dos lugares donde ya discrepaban:
 *  - la marca de los correos de teletrabajo ignoraba la empresa recibida y
 *    tomaba la PRIMERA de la base, de modo que un tenant podía recibir el
 *    correo con el nombre y el logo de otro;
 *  - seis servicios traían TODAS las configuraciones activas y partían el CSV
 *    para armar su propio índice por slug, cada uno por su cuenta. Ahora hay
 *    una sola frontera (`helpers/system_settings_by_business_unit.ts`).
 *
 * `down()` la repone vacía. Su contenido se deriva de `business_unit_id`, y
 * reconstruirlo sería inventar una verdad que ya vive en otro lado.
 */

const TABLE = 'system_settings'
const COLUMN = 'system_setting_business_units'

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
