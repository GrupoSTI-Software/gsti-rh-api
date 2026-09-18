import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retira el CSV `role_business_access` de `roles`.
 *
 * Era la forma de decir a qué empresas pertenecía un rol cuando un rol no tenía
 * dueño: una lista de slugs de empresa separados por comas, consultada con
 * `FIND_IN_SET`. Desde que existe `roles.business_unit_id` (`1789528501204`) y
 * cada empresa estrena su propio juego de roles, la pertenencia la dice la
 * llave, y mantener las dos fuentes solo abre la puerta a que discrepen.
 *
 * Se va la columna entera, no se vacía: una columna que nadie lee pero sigue
 * ahí es una invitación a volver a escribirla.
 *
 * `down()` la repone vacía. No reconstruye su contenido —no podría: los slugs
 * de empresa a los que apuntaba se derivan de `business_unit_id`, y rehacer el
 * CSV sería inventar una verdad que ya vive en otro lado—.
 */

const TABLE = 'roles'
const COLUMN = 'role_business_access'

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

      await db.rawQuery(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${COLUMN}\` VARCHAR(255) NULL AFTER \`role_active\``
      )
    })
  }
}
