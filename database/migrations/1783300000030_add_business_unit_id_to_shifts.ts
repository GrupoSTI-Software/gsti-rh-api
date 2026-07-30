import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/**
 * Unidad de negocio por defecto para turnos con baja lógica que no resuelven
 * su empresa desde el CSV (datos legados sin `shift_business_units`).
 *
 * Decisión (2026-07-20): SAE (id 1), la unidad base. Solo aplica a filas ya
 * borradas lógicamente; su empresa es cosmética (solo relevante para consultas
 * `withTrashed`) y no revive el registro.
 */
const FALLBACK_BUSINESS_UNIT_ID = 1

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
 *
 * ## Idempotencia
 * El `ALTER TABLE ADD COLUMN` hace auto-commit en MySQL y no se revierte si el
 * bloque diferido aborta. Por eso toda la migración corre dentro de `defer`
 * con guardas de existencia (columna y FK): una corrida que abortó en el guard
 * de calidad de datos puede reintentarse sin fallar por "Duplicate column".
 */
export default class extends BaseSchema {
  protected tableName = 'shifts'

  async up() {
    this.defer(async (db) => {
      // ── 1. Alta idempotente de la columna ───────────────────────────────
      if (!(await this.columnExists(db, 'business_unit_id'))) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\`
           ADD COLUMN \`business_unit_id\` INT UNSIGNED NULL AFTER \`shift_business_units\``
        )
      }

      // ── 2. Backfill desde el primer slug del CSV ─────────────────────────
      // TRIM cubre espacios en datos legados. Cubre también filas soft-deleted:
      // el UPDATE no filtra por shift_deleted_at, para no reabrir el universo
      // vía withTrashed más adelante.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` s
         INNER JOIN \`business_units\` bu
           ON bu.business_unit_slug = TRIM(SUBSTRING_INDEX(s.shift_business_units, ',', 1))
         SET s.business_unit_id = bu.business_unit_id
         WHERE s.business_unit_id IS NULL
           AND s.shift_business_units IS NOT NULL
           AND s.shift_business_units <> ''`
      )

      // ── 3. Fallback para huérfanos con baja lógica ───────────────────────
      // Turnos ya borrados sin CSV resoluble (datos legados). Se les asigna la
      // unidad base para poder forzar NOT NULL sin distorsionar datos vivos.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\`
         SET business_unit_id = ?
         WHERE business_unit_id IS NULL
           AND shift_deleted_at IS NOT NULL`,
        [FALLBACK_BUSINESS_UNIT_ID]
      )

      // ── 4. Guard de calidad ANTES del NOT NULL ───────────────────────────
      // Tras el backfill y el fallback, cualquier huérfano restante es un turno
      // ACTIVO sin empresa resoluble: ese sí es el caso que amerita escalar a
      // Wilvardo (unidad por defecto o baja), no se fuerza NOT NULL a ciegas.
      const orphanRows = await db.rawQuery(
        `SELECT COUNT(*) AS total FROM \`${this.tableName}\` WHERE \`business_unit_id\` IS NULL`
      )
      const orphanCount = Array.isArray(orphanRows)
        ? Number((orphanRows[0] as Array<{ total: number }>)[0]?.total ?? 0)
        : 0

      if (orphanCount > 0) {
        throw new Error(
          `shifts: ${orphanCount} turnos ACTIVOS sin business_unit_id resoluble desde el CSV — ` +
            'escalar a Wilvardo antes de forzar NOT NULL (decisión: unidad por defecto o baja).'
        )
      }

      // ── 5. NOT NULL + índice + FK (idempotente por existencia de la FK) ──
      if (!(await this.foreignKeyExists(db, 'shifts_business_unit_id_foreign'))) {
        await db.rawQuery(
          `ALTER TABLE \`${this.tableName}\`
           MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
           ADD INDEX \`shifts_business_unit_id_index\` (\`business_unit_id\`),
           ADD CONSTRAINT \`shifts_business_unit_id_foreign\`
             FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
        )
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'shifts_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'shifts_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }

  /** Indica si una columna ya existe en la tabla del esquema activo. */
  private async columnExists(db: QueryClientContract, column: string) {
    const rows = await db.rawQuery(
      `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, column]
    )
    return Array.isArray(rows)
      ? Number((rows[0] as Array<{ total: number }>)[0]?.total ?? 0) > 0
      : false
  }

  /** Indica si una restricción de llave foránea ya existe en la tabla. */
  private async foreignKeyExists(db: QueryClientContract, name: string) {
    const rows = await db.rawQuery(
      `SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
      [this.tableName, name]
    )
    return Array.isArray(rows)
      ? Number((rows[0] as Array<{ total: number }>)[0]?.total ?? 0) > 0
      : false
  }
}
