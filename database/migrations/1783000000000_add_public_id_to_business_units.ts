import { BaseSchema } from '@adonisjs/lucid/schema'
import crypto from 'node:crypto'

/**
 * Agrega `business_unit_public_id` (UUID v4) a la tabla `business_units`.
 *
 * Flujo de la migración:
 *  1. Agrega la columna como nullable (sin restricción para no bloquear filas existentes).
 *  2. Llena cada fila con un UUID v4 generado en Node (backfill idempotente).
 *  3. Convierte la columna a NOT NULL y agrega índice UNIQUE —
 *     todo en un solo ALTER para minimizar locks.
 *
 * Resultado: el número consecutivo interno (business_unit_id) queda como FK
 * únicamente para las uniones internas; el UUID es el identificador público.
 */
export default class extends BaseSchema {
  protected tableName = 'business_units'

  async up() {
    // Paso 1: columna nullable (sin romper filas existentes)
    this.schema.alterTable(this.tableName, (table) => {
      table.string('business_unit_public_id', 36).nullable().after('business_unit_id')
    })

    // Pasos 2 y 3: backfill → NOT NULL + índice UNIQUE (en defer, que corre
    // después de que Knex ejecuta los cambios de schema anteriores)
    this.defer(async (db) => {
      const rows = await db.from(this.tableName).select('business_unit_id')

      for (const row of rows) {
        await db
          .from(this.tableName)
          .where('business_unit_id', row.business_unit_id)
          .update({ business_unit_public_id: crypto.randomUUID() })
      }

      // Un solo ALTER: hace NOT NULL y agrega el índice único en un paso
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_public_id\` CHAR(36) NOT NULL,
         ADD UNIQUE INDEX \`business_units_public_id_unique\` (\`business_unit_public_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['business_unit_public_id'], 'business_units_public_id_unique')
      table.dropColumn('business_unit_public_id')
    })
  }
}
