import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unicidad de la credencial de acceso entre cuentas vivas (USRH1789698261611).
 *
 * Agrega la columna generada VIRTUAL `user_email_active` y el índice UNIQUE
 * `users_email_active_unique` sobre ella. Patrón columna generada + UNIQUE,
 * nunca UNIQUE plano: un UNIQUE plano sobre `user_email` dejaría el correo
 * ocupado para siempre al dar de baja al usuario (la fila conserva su valor);
 * es el defecto que hizo retirar la regla en 2024. La expresión devuelve NULL
 * en las borradas y MySQL trata cada NULL como distinto, así que N borradas
 * con el mismo correo conviven (regla 3) mientras dos vivas no pueden (regla 1).
 *
 * VIRTUAL, no STORED: el índice secundario materializa igual el valor y el
 * ALTER es solo metadatos, sin reconstruir `users`.
 *
 * El índice se condiciona sobre `user_deleted_at`, NO sobre `user_active`:
 * desactivar es reversible y liberaría el correo para una reactivación con
 * duplicado (regla 4). Sin cláusula COLLATE: se hereda `utf8mb4_0900_ai_ci`
 * de la expresión, case y accent insensitive por construcción (regla 5).
 * `TRIM` porque la collation es NO PAD y sin él `'a@x.com '` conviviría con
 * `'a@x.com'` (CA-9).
 *
 * El censo va en `this.defer` registrado PRIMERO: en MySQL cada ALTER TABLE
 * hace commit implícito y un aborto posterior dejaría la tabla a medias.
 * El aborto no proyecta ningún correo (ni completo ni enmascarado) ni
 * `business_unit_id`: lista `user_id`, `person_id`, `user_active` y conteos.
 */

const TABLE = 'users'
const EMAIL_COL = 'user_email'
const ACTIVE_COL = 'user_email_active'
const DELETED_AT = 'user_deleted_at'
const INDEX = 'users_email_active_unique'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — censo de vivas duplicadas (ANTES de cualquier DDL).
    this.defer(async (db) => {
      await db.rawQuery('SET SESSION group_concat_max_len = 1000000')
      type DupRow = { total: number; cuentas: string }
      const [rows] = await db.rawQuery<[DupRow[]]>(
        `SELECT
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT('user_id=', \`user_id\`, ' person_id=', \`person_id\`, ' user_active=', \`user_active\`)
             ORDER BY \`user_id\`
             SEPARATOR ', '
           ) AS cuentas
         FROM \`${TABLE}\`
         WHERE \`${DELETED_AT}\` IS NULL
         GROUP BY TRIM(\`${EMAIL_COL}\`)
         HAVING COUNT(*) > 1
         ORDER BY total DESC`
      )
      if (rows.length === 0) return
      const lines = rows.map((r) => `  - x${r.total} -> ${r.cuentas}`).join('\n')
      throw new Error(
        '[USRH1789698261611] Cuentas vivas compartiendo correo de acceso — resolver manualmente antes de continuar:\n' +
          `${lines}\n` +
          'Consultas de diagnóstico (sin proyectar correos):\n' +
          `  SELECT user_id, person_id, user_active, COUNT(*) OVER (PARTITION BY TRIM(\`${EMAIL_COL}\`)) AS repetidos FROM \`${TABLE}\` WHERE \`${DELETED_AT}\` IS NULL ORDER BY user_id;`
      )
    })

    // Paso 2 — columna generada VIRTUAL.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD COLUMN \`${ACTIVE_COL}\` VARCHAR(200)
        GENERATED ALWAYS AS (
          CASE WHEN \`${DELETED_AT}\` IS NULL
               THEN TRIM(\`${EMAIL_COL}\`)
               ELSE NULL END
        ) VIRTUAL
    `)

    // Paso 3 — índice UNIQUE sobre la generada.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD UNIQUE KEY \`${INDEX}\` (\`${ACTIVE_COL}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      const [idxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND index_name = '${INDEX}'`
      )
      if ((idxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``)
      }
      const [colRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = '${ACTIVE_COL}'`
      )
      if ((colRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${ACTIVE_COL}\``)
      }
    })
  }
}
