import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_medical_conditions`
 * (datos de salud, riesgo Crítico) es punto de entrada directo sin marca de
 * pertenencia propia. Su ruta además no monta `middleware.auth()` — ver
 * fix separado en `start/routes/employee_medical_condition_routes.ts`.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_medical_conditions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employees\` e ON e.employee_id = child.employee_id
         SET child.business_unit_id = e.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`employee_medical_conditions_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_medical_conditions_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_medical_conditions_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_medical_conditions_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
