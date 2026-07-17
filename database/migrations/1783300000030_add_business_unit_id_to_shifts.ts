import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1783821206521 — `shifts` (turnos) es el único dominio dueño de primer
 * nivel que quedó fuera del aislamiento automático: su pertenencia vivía en
 * `shift_business_units` (CSV de slugs), no en una FK directa.
 *
 * Decisión de producto (Wilvardo, 2026-07-11): una sola unidad dueña por
 * turno. Un turno que históricamente figuraba en varias unidades colapsa al
 * primer slug del CSV. No hay tabla puente ni fila-por-unidad.
 *
 * `shift_business_units` se conserva como espejo denormalizado (lo siguen
 * escribiendo store/update/createShift) pero deja de gobernar el
 * aislamiento — lo gobierna esta columna vía `withBusinessUnitScope()`.
 */
export default class extends BaseSchema {
  protected tableName = 'shifts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('shift_business_units')
    })

    this.defer(async (db) => {
      // Backfill desde el primer slug del CSV (TRIM cubre espacios en datos legados).
      // Cubre también filas soft-deleted: el UPDATE no filtra por shift_deleted_at,
      // para no reabrir el universo vía withTrashed más adelante.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` s
         INNER JOIN \`business_units\` bu
           ON bu.business_unit_slug = TRIM(SUBSTRING_INDEX(s.shift_business_units, ',', 1))
         SET s.business_unit_id = bu.business_unit_id
         WHERE s.business_unit_id IS NULL
           AND s.shift_business_units IS NOT NULL
           AND s.shift_business_units <> ''`
      )

      // Guard de calidad de datos ANTES del NOT NULL: turnos con CSV vacío/nulo
      // o cuyo primer slug no exista en business_units quedarían huérfanos.
      // No se fuerza la columna obligatoria a ciegas — se aborta limpio y se
      // escala a Wilvardo (decisión: unidad por defecto o baja).
      const orphanRows = await db.rawQuery(
        `SELECT COUNT(*) AS total FROM \`${this.tableName}\` WHERE \`business_unit_id\` IS NULL`
      )
      const orphanCount = Array.isArray(orphanRows)
        ? Number((orphanRows[0] as Array<{ total: number }>)[0]?.total ?? 0)
        : 0

      if (orphanCount > 0) {
        throw new Error(
          `shifts: ${orphanCount} filas sin business_unit_id resoluble desde el CSV — ` +
            'escalar a Wilvardo antes de forzar NOT NULL (decisión: unidad por defecto o baja).'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`shifts_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`shifts_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'shifts_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'shifts_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
