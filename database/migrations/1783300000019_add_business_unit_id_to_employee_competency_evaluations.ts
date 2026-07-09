import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_competency_evaluations`
 * (riesgo Alto) es punto de entrada directo sin marca de pertenencia propia.
 * No tiene FK directa a `employees`; cuelga de `employee_evaluations` vía
 * `employee_evaluation_id`, así que el backfill va vía ese padre (que a su
 * vez ya tiene su propio `business_unit_id` desde la migración 1783300000012).
 */
export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_evaluation_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` child
         INNER JOIN \`employee_evaluations\` ev ON ev.employee_evaluation_id = child.employee_evaluation_id
         SET child.business_unit_id = ev.business_unit_id
         WHERE child.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`employee_competency_evaluations_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_competency_evaluations_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_competency_evaluations_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_competency_evaluations_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
