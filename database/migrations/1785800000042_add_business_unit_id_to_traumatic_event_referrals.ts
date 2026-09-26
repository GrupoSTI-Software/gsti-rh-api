import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1786595131490 — marca de empresa en canalizaciones de evento traumático.
 * Hereda del reporte padre. No se filtra el soft-delete del padre (R-T1).
 */
export default class extends BaseSchema {
  protected tableName = 'traumatic_event_referrals'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('traumatic_event_report_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` c
         INNER JOIN \`traumatic_event_reports\` r
           ON r.traumatic_event_report_id = c.traumatic_event_report_id
         SET c.business_unit_id = r.business_unit_id
         WHERE c.business_unit_id IS NULL`
      )

      const [rows] = await db.rawQuery(
        `SELECT COUNT(*) AS orphan_count FROM \`${this.tableName}\` WHERE business_unit_id IS NULL`
      )
      const orphanRows = Array.isArray(rows) ? (rows as Array<{ orphan_count: number }>) : []
      const orphanCount = Number(orphanRows[0]?.orphan_count ?? 0)
      if (orphanCount > 0) {
        throw new Error(
          `${this.tableName}: ${orphanCount} registro(s) sin business_unit_id resoluble ` +
            'desde el reporte padre — escalar a Wilvardo. No se ejecutó el MODIFY NOT NULL.'
        )
      }

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`traumatic_event_referrals_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`traumatic_event_referrals_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'traumatic_event_referrals_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'traumatic_event_referrals_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
