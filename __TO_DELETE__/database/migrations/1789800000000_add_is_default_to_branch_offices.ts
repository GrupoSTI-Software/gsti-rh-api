import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Sucursal default por empresa.
 *
 * Agrega `branch_office_is_default`, la columna generada VIRTUAL
 * `branch_office_default_bu` y el UNIQUE sobre ella. El patrón es columna
 * generada + UNIQUE, nunca UNIQUE plano sobre (business_unit_id, is_default):
 * ese índice solo permitiría UNA sucursal no-default por empresa, que es lo
 * contrario de lo que queremos. La columna generada devuelve el
 * business_unit_id solo cuando la sucursal es default y está viva, y NULL en
 * cualquier otro caso; MySQL trata cada NULL como distinto, así que conviven
 * N no-default y N borradas, pero nunca dos default vivas de la misma empresa.
 * Mismo molde que 1787932877000000_add_slug_active_unique_to_business_units.
 *
 * La detección previa va con `this.defer` registrado primero para que corra
 * ANTES de cualquier DDL: en MySQL cada ALTER TABLE hace commit implícito y no
 * se revierte, así que un abort posterior dejaría la tabla a medias.
 *
 * No hay backfill: las empresas existentes se quedan sin default y la reciben
 * de forma perezosa la primera vez que alguien la necesita, vía
 * BranchOfficeProvisioningService.ensureDefault.
 */

const TABLE = 'branch_offices'
const FLAG_COL = 'branch_office_is_default'
const GENERATED_COL = 'branch_office_default_bu'
const BU_COL = 'business_unit_id'
const DELETED_AT = 'branch_office_deleted_at'
const INDEX = 'branch_offices_default_bu_unique'

export default class extends BaseSchema {
  protected tableName = TABLE

  async up() {
    // Paso 1 — la tabla no debe traer ya dos defaults vivas por empresa.
    // Hoy es imposible (la columna no existe), pero la migración tiene que ser
    // segura si se re-corre sobre una base que ya pasó por aquí.
    this.defer(async (db) => {
      type ColumnRow = { cnt: number }
      const [colRows] = await db.rawQuery<[ColumnRow[]]>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = '${TABLE}'
           AND column_name = '${FLAG_COL}'`
      )
      if ((colRows[0]?.cnt ?? 0) === 0) return

      type DupRow = { business_unit_id: number; total: number; sucursales: string }
      const [rows] = await db.rawQuery<[DupRow[]]>(
        `SELECT
           \`${BU_COL}\`,
           COUNT(*) AS total,
           GROUP_CONCAT(
             CONCAT(\`branch_office_id\`, ' (', \`branch_office_name\`, ')')
             ORDER BY \`branch_office_id\`
             SEPARATOR ', '
           ) AS sucursales
         FROM \`${TABLE}\`
         WHERE \`${DELETED_AT}\` IS NULL
           AND \`${FLAG_COL}\` = 1
         GROUP BY \`${BU_COL}\`
         HAVING COUNT(*) > 1
         ORDER BY \`${BU_COL}\` ASC`
      )

      if (rows.length === 0) return

      const lines = rows
        .map((r) => `  - empresa ${r.business_unit_id}: x${r.total} -> ${r.sucursales}`)
        .join('\n')

      throw new Error(
        'Empresas con más de una sucursal default viva — dejar una sola antes de continuar:\n' + lines
      )
    })

    // Paso 2 — la marca.
    this.schema.alterTable(TABLE, (table) => {
      table.boolean(FLAG_COL).notNullable().defaultTo(false)
    })

    // Paso 3 — columna generada: el business_unit_id solo en la default viva.
    // Se crea con `raw` porque Knex no expone `generatedAs` para columnas
    // virtuales en MySQL.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD COLUMN \`${GENERATED_COL}\` INT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`${FLAG_COL}\` = 1 AND \`${DELETED_AT}\` IS NULL
               THEN \`${BU_COL}\`
               ELSE NULL END
        ) VIRTUAL
    `)

    // Paso 4 — el candado.
    this.schema.raw(`
      ALTER TABLE \`${TABLE}\`
      ADD UNIQUE KEY \`${INDEX}\` (\`${GENERATED_COL}\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: un up() abortado a media debe poder revertirse.
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

      for (const column of [GENERATED_COL, FLAG_COL]) {
        const [colRows] = await db.rawQuery<[CountRow[]]>(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE table_schema = DATABASE()
             AND table_name = '${TABLE}'
             AND column_name = '${column}'`
        )
        if ((colRows[0]?.cnt ?? 0) > 0) {
          await db.rawQuery(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${column}\``)
        }
      }
    })
  }
}
