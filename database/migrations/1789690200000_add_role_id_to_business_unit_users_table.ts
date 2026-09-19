import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Rol efectivo por empresa en la pivote `business_unit_users`.
 *
 * Por qué: `users.role_id` es uno solo por cuenta, pero un usuario puede
 * pertenecer a varias empresas (`business_unit_users`). Mientras los roles
 * fueron globales eso no se notaba; desde que `roles.business_unit_id` le pone
 * dueño a cada rol (`1789528501204`), ese `role_id` único apunta al rol de UNA
 * empresa y deja al usuario con un rol ajeno —o inexistente— en las demás.
 * El rol deja de colgar de la cuenta y pasa a colgar del par (empresa, cuenta).
 *
 * Entra NULLABLE y la migración NO toca datos: el backfill corre después, por
 * comando, y hasta entonces `users.role_id` sigue siendo la fuente. Una
 * migración posterior lo pondrá NOT NULL cuando no quede ninguna fila en NULL.
 *
 * RESTRICT (el default de Knex) en la FK: un rol con usuarios ligados no se
 * borra por accidente desde la BD. La baja lógica de un rol sigue pasando por
 * `role_deleted_at` y por el servicio, que es quien sabe a dónde reasignar.
 *
 * El índice `(business_unit_id, role_id)` sirve la pregunta que el runtime hace
 * en cada request —qué rol tiene esta cuenta en esta empresa— y también la del
 * retiro de un rol: quién lo trae puesto dentro de la empresa.
 */

const TABLE = 'business_unit_users'
const ROLES_TABLE = 'roles'
const ROLE_ID = 'role_id'
const USER_ID = 'user_id'
const BUSINESS_UNIT_ID = 'business_unit_id'
const ROLE_INDEX = 'business_unit_users_business_unit_id_role_id_index'
const ROLE_FK = 'business_unit_users_role_id_foreign'

type CountRow = { cnt: number }

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable(TABLE, (table) => {
      table.integer(ROLE_ID).unsigned().nullable().after(USER_ID)
      table.index([BUSINESS_UNIT_ID, ROLE_ID], ROLE_INDEX)
      table.foreign(ROLE_ID, ROLE_FK).references('role_id').inTable(ROLES_TABLE)
    })
  }

  async down() {
    // Tolerante a estado parcial: se consulta information_schema antes de cada
    // paso para que el rollback funcione aunque `up()` haya abortado a media
    // (molde: 1789528501204).
    this.defer(async (db) => {
      const exists = async (query: string, name: string): Promise<boolean> => {
        const [rows] = await db.rawQuery<[CountRow[]]>(query, [TABLE, name])
        return (rows[0]?.cnt ?? 0) > 0
      }

      const constraintExists = (name: string) =>
        exists(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.TABLE_CONSTRAINTS
           WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
          name
        )

      const indexExists = (name: string) =>
        exists(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.STATISTICS
           WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
          name
        )

      const columnExists = (name: string) =>
        exists(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          name
        )

      // La FK sale antes que su índice y su columna.
      if (await constraintExists(ROLE_FK)) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP FOREIGN KEY \`${ROLE_FK}\``)
      }
      if (await indexExists(ROLE_INDEX)) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${ROLE_INDEX}\``)
      }
      if (await columnExists(ROLE_ID)) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${ROLE_ID}\``)
      }
    })
  }
}
