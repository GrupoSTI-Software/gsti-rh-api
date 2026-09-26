import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786736057522 — columnas de invitación de acceso en `users`.
 *
 * - `user_token_expires_at`: caducidad del enlace de invitación (5 días desde emisión).
 * - `user_password_set_at`: marca de cuándo la persona fijó su propia contraseña.
 *
 * Backfill (regla 9): usuarios existentes se consideran ya activados con
 * `user_password_set_at = user_created_at`.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('user_token_expires_at').nullable().defaultTo(null).after('user_token')
      table.timestamp('user_password_set_at').nullable().defaultTo(null).after('user_token_expires_at')
    })

    this.defer(async (db) => {
      const updated = await db.rawQuery(
        'UPDATE ?? SET user_password_set_at = user_created_at WHERE user_password_set_at IS NULL',
        [this.tableName]
      )
      const affected = updated[0]?.affectedRows ?? updated[0]?.rowCount ?? 0
      console.warn(
        `[backfill user_password_set_at] filas actualizadas=${affected}.`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_password_set_at')
      table.dropColumn('user_token_expires_at')
    })
  }
}
