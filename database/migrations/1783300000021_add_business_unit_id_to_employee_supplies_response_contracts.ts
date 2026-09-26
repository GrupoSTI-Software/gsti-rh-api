import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_supplies_response_contracts`
 * (riesgo Alto) es punto de entrada directo sin marca de pertenencia propia.
 * No tiene FK directa a `employees`; cuelga de `employee_supplies` vía
 * `employee_supply_id` (ver migración 1783300000016).
 */
export default class extends BaseSchema {
  protected tableName = 'employee_supplies_response_contracts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_supply_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employee_supplies\` s ON s.employee_supply_id = child.employee_supply_id
         SET child.business_unit_id = s.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`emp_supplies_resp_contracts_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`emp_supplies_resp_contracts_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'emp_supplies_resp_contracts_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'emp_supplies_resp_contracts_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
