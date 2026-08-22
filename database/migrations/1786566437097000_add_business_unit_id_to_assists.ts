import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786566437097 — M1: marca de pertenencia en `assists`.
 * Columna nullable + índice; backfill J3→J2→J1 por lotes.
 * NOT NULL y FK van en migración M3 (post-deploy).
 * Evidencia CA-24: database/migration_evidence/USRH1786566437097/
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('assist_emp_id')
      table.index(['business_unit_id'], 'assists_business_unit_id_index')
    })

    this.schema.alterTable('employees', (table) => {
      table.index(['employee_sync_id'], 'employees_employee_sync_id_index')
    })

    this.defer(async (db) => {
      const CHUNK = 50_000
      const bounds = await db.rawQuery(
        'SELECT COALESCE(MIN(assist_id), 0) AS min_id, COALESCE(MAX(assist_id), 0) AS max_id FROM `assists`'
      )
      const minId = Number(bounds?.[0]?.[0]?.min_id ?? 0)
      const maxId = Number(bounds?.[0]?.[0]?.max_id ?? 0)

      for (let from = minId; from <= maxId; from += CHUNK) {
        const to = from + CHUNK - 1

        // J3 — origen BioTime: assist_emp_id == employees.employee_sync_id (comparación numérica)
        await db.rawQuery(
          `UPDATE \`assists\` a
             INNER JOIN (
               SELECT CAST(e.employee_sync_id AS UNSIGNED) AS sid, MIN(e.business_unit_id) AS bu
               FROM \`employees\` e
               WHERE e.employee_sync_id IS NOT NULL
                 AND e.employee_sync_id <> '0'
                 AND e.business_unit_id IS NOT NULL
               GROUP BY CAST(e.employee_sync_id AS UNSIGNED)
               HAVING COUNT(DISTINCT e.business_unit_id) = 1
             ) m ON m.sid = a.assist_emp_id
             SET a.business_unit_id = m.bu
           WHERE a.business_unit_id IS NULL
             AND a.assist_sync_id <> 0
             AND a.assist_emp_id <> 0
             AND a.assist_id BETWEEN ? AND ?`,
          [from, to]
        )

        // J2 — origen local: assist_emp_id == employees.employee_id (PK)
        await db.rawQuery(
          `UPDATE \`assists\` a
             INNER JOIN \`employees\` e ON e.employee_id = a.assist_emp_id
             SET a.business_unit_id = e.business_unit_id
           WHERE a.business_unit_id IS NULL
             AND a.assist_sync_id = 0
             AND a.assist_emp_id <> 0
             AND e.business_unit_id IS NOT NULL
             AND a.assist_id BETWEEN ? AND ?`,
          [from, to]
        )

        // J1 — por código, solo donde resuelve a una sola empresa
        await db.rawQuery(
          `UPDATE \`assists\` a
             INNER JOIN (
               SELECT e.employee_code AS code, MIN(e.business_unit_id) AS bu
               FROM \`employees\` e
               WHERE e.business_unit_id IS NOT NULL
               GROUP BY e.employee_code
               HAVING COUNT(DISTINCT e.business_unit_id) = 1
             ) m ON m.code = a.assist_emp_code COLLATE utf8mb4_unicode_ci
             SET a.business_unit_id = m.bu
           WHERE a.business_unit_id IS NULL
             AND a.assist_id BETWEEN ? AND ?`,
          [from, to]
        )
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['business_unit_id'], 'assists_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })

    this.schema.alterTable('employees', (table) => {
      table.dropIndex(['employee_sync_id'], 'employees_employee_sync_id_index')
    })
  }
}
