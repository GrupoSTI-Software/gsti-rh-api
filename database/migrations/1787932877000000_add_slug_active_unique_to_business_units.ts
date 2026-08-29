import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Unicidad de slug entre empresas activas (USRH1787932877000).
 *
 * Agrega la columna generada VIRTUAL `business_unit_slug_active` y el índice
 * UNIQUE `business_units_slug_active_unique` sobre ella.  El patrón es
 * columna generada + UNIQUE, **nunca UNIQUE plano**: un UNIQUE plano sobre
 * `business_unit_slug` dejaría el valor ocupado para siempre al borrar
 * lógicamente una empresa (la fila conserva su slug).  La columna generada
 * devuelve NULL en las borradas y MySQL trata cada NULL como distinto, así
 * que N empresas borradas con el mismo slug conviven sin error (regla 2 de
 * la HU) mientras que dos vivas no pueden (regla 1).
 *
 * Se crean con `this.schema.raw` y no dentro de `alterTable` porque Knex no
 * expone `generatedAs` para columnas virtuales en MySQL.
 *
 * Paso 1 — detección con abort y listado — va registrado primero con
 * `this.defer` para que corra ANTES de cualquier DDL.  En MySQL cada
 * `ALTER TABLE` hace commit implícito y no se revierte; si el saneo
 * corriera después, un abort dejaría la tabla a medias.
 *
 * El `down()` es tolerante a estado parcial: verifica existencia en
 * `information_schema` antes de cada DROP para que el rollback funcione
 * aunque el `up()` haya abortado a media.
 */

const TABLE = 'business_units'
const SLUG_COL = 'business_unit_slug'
const ACTIVE_COL = 'business_unit_slug_active'
const DELETED_AT = 'business_unit_deleted_at'
const INDEX = 'business_units_slug_active_unique'

/** Cinco tablas que guardan el slug denormalizado como CSV (Anexo D.2). */
const CSV_TABLES = [
  'system_settings.system_setting_business_units',
  'proceeding_file_types.proceeding_file_type_business_units',
  'holidays.holiday_business_units',
  'shifts.shift_business_units',
  'roles.role_business_access',
]

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — detección de duplicados vivos (ANTES de cualquier DDL).
    // defer registrado primero → se ejecuta primero en trackedCalls.
    this.defer(async (db) => {
      type DupRow = { business_unit_slug: string; total: number; empresas: string }
      const [rows] = await db.rawQuery<[DupRow[]]>(
        `SELECT
           \`${SLUG_COL}\`,
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT(\`business_unit_id\`, ' (', \`business_unit_name\`, ')')
             ORDER BY \`business_unit_id\`
             SEPARATOR ', '
           ) AS empresas
         FROM \`${TABLE}\`
         WHERE \`${DELETED_AT}\` IS NULL
         GROUP BY \`${SLUG_COL}\`
         HAVING COUNT(*) > 1
         ORDER BY \`${SLUG_COL}\` ASC`
      )

      if (rows.length === 0) return

      const lines = rows
        .map((r) => `  - "${r.business_unit_slug}" x${r.total} -> ${r.empresas}`)
        .join('\n')
      const csvWarning = CSV_TABLES.map((t) => `  · ${t}`).join('\n')

      throw new Error(
        '[USRH1787932877000] Empresas activas compartiendo slug — resolver manualmente antes de continuar:\n' +
          `${lines}\n` +
          'Las listas de slugs de las siguientes tablas pueden tener entradas ya no distinguibles:\n' +
          `${csvWarning}`
      )
    })

    // Paso 2 — columna generada VIRTUAL: slug real en vivas, NULL en borradas.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD COLUMN \`${ACTIVE_COL}\` VARCHAR(250)
        GENERATED ALWAYS AS (
          CASE WHEN \`${DELETED_AT}\` IS NULL
               THEN \`${SLUG_COL}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    // Paso 3 — índice UNIQUE sobre la columna generada.
    // Cada NULL se considera distinto → las borradas no compiten por el slot.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD UNIQUE KEY \`${INDEX}\` (\`${ACTIVE_COL}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: verifica información_schema antes de cada
    // DROP para que el rollback funcione aunque up() haya abortado a media
    // (el molde de 1787623518696000 no lo hace y su rollback fallaría aquí).
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
