import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784316436823 — defensa en profundidad: marca de empresa en avisos.
 * Backfill desde destinatarios→empleados (MIN determinista). Columna nullable:
 * avisos legacy no derivables quedan ocultos en consultas por tenant.
 */
export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('notice_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` n
         INNER JOIN (
           SELECT nr.notice_id, MIN(e.business_unit_id) AS bu
           FROM notice_recipients nr
           INNER JOIN employees e ON e.employee_id = nr.employee_id
           WHERE e.business_unit_id IS NOT NULL
           GROUP BY nr.notice_id
         ) d ON d.notice_id = n.notice_id
         SET n.business_unit_id = d.bu
         WHERE n.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         ADD INDEX \`notices_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`notices_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'notices_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'notices_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
