import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784316436879 — defensa en profundidad: marca de empresa en el log interno
 * de avisos de faltas a RH (dedupe del cron `notify:attendance-fault-hr`).
 */
export default class extends BaseSchema {
  protected tableName = 'attendance_fault_hr_notification_logs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` log
         INNER JOIN \`employees\` e ON e.employee_id = log.employee_id
         SET log.business_unit_id = COALESCE(e.business_unit_id, 1)
         WHERE log.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`attendance_fault_hr_notification_logs_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`attendance_fault_hr_notification_logs_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'attendance_fault_hr_notification_logs_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'attendance_fault_hr_notification_logs_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
