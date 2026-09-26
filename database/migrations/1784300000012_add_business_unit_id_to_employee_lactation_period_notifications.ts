import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1784259058510 — avisos de lactancia: backfill 2 saltos vía periodo.
 * No filtrar soft-deleted del periodo padre.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_lactation_period_notifications'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_lactation_period_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employee_lactation_periods\` p
           ON p.employee_lactation_period_id = child.employee_lactation_period_id
         INNER JOIN \`employees\` e ON e.employee_id = p.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`employee_lactation_period_notifications_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_lactation_period_notifications_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(
        ['business_unit_id'],
        'employee_lactation_period_notifications_business_unit_id_foreign'
      )
      table.dropIndex(
        ['business_unit_id'],
        'employee_lactation_period_notifications_business_unit_id_index'
      )
      table.dropColumn('business_unit_id')
    })
  }
}
