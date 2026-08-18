import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre de fuga viva (USRH1786595131484) — `career_path_templates.company_id`
 * ya existe, es FK real a `business_units` y ya está poblada. Nadie la usaba
 * para filtrar. Esta migración solo cambia la nulabilidad a NOT NULL (regla 1)
 * con backfill condicional desde el puesto de origen (regla 9) y un pre-check
 * bloqueante: si alguna fila no resuelve dueño, aborta y se escala a Wilvardo.
 *
 * No se crea columna ni FK. El índice `career_path_templates_company_id_foreign`
 * ya lo creó InnoDB con la FK original (PC-5, 2026-08-17, BD local).
 *
 * `down()` revierte solo la nulabilidad, no el backfill: no hay forma de saber
 * qué filas eran NULL.
 */
export default class extends BaseSchema {
  protected tableName = 'career_path_templates'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` cpt
         INNER JOIN \`positions\` p ON p.position_id = cpt.origin_position_id
         SET cpt.company_id = p.business_unit_id
         WHERE cpt.company_id IS NULL
           AND p.business_unit_id IS NOT NULL`
      )

      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS orphan_count
         FROM \`${this.tableName}\`
         WHERE company_id IS NULL`
      )
      const orphanRows = Array.isArray(rows) ? (rows as Array<{ orphan_count: number }>) : []
      const orphanCount = orphanRows[0]?.orphan_count ?? 0

      if (orphanCount > 0) {
        throw new Error(
          `career_path_templates: ${orphanCount} registro(s) sin company_id resoluble ` +
            'desde el puesto de origen — escalar a Wilvardo antes de continuar. ' +
            'No se ejecutó el MODIFY NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`company_id\` INT UNSIGNED NOT NULL`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`company_id\` INT UNSIGNED NULL`
      )
    })
  }
}
