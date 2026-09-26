import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `position_salary_range_audit`
 * (riesgo Crítico, auditoría salarial) es punto de entrada directo sin marca
 * de pertenencia propia. No tiene FK a `positions`; cuelga de
 * `position_salary_ranges` vía `range_id`, que ya tiene su propio
 * `business_unit_id` (columna nativa desde su creación).
 */
export default class extends BaseSchema {
  protected tableName = 'position_salary_range_audit'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('range_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` audit
         INNER JOIN \`position_salary_ranges\` psr ON psr.position_salary_range_id = audit.range_id
         SET audit.business_unit_id = psr.business_unit_id
         WHERE audit.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`position_salary_range_audit_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`position_salary_range_audit_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'position_salary_range_audit_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'position_salary_range_audit_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
