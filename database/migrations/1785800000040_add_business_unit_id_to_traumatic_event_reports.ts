import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786595131490 — marca de empresa propia en el reporte de evento
 * traumático. Backfill desde `employees.business_unit_id` (un salto).
 * No se filtra `employee_deleted_at`: el NOT NULL aplica a toda la tabla,
 * incluidos reportes cuyo colaborador está dado de baja (R-T1).
 *
 * Si tras el JOIN queda alguna fila sin resolver, se aborta y se escala
 * a Wilvardo (R-9). Sin unidad de relleno.
 */
export default class extends BaseSchema {
  protected tableName = 'traumatic_event_reports'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` r
         INNER JOIN \`employees\` e ON e.employee_id = r.employee_id
         SET r.business_unit_id = e.business_unit_id
         WHERE r.business_unit_id IS NULL`
      )

      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS orphan_count FROM \`${this.tableName}\` WHERE business_unit_id IS NULL`
      )
      const orphanRows = Array.isArray(rows) ? (rows as Array<{ orphan_count: number }>) : []
      const orphanCount = Number(orphanRows[0]?.orphan_count ?? 0)
      if (orphanCount > 0) {
        throw new Error(
          `${this.tableName}: ${orphanCount} registro(s) sin business_unit_id resoluble ` +
            'desde el empleado — escalar a Wilvardo. No se ejecutó el MODIFY NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`traumatic_event_reports_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`traumatic_event_reports_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'traumatic_event_reports_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'traumatic_event_reports_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
