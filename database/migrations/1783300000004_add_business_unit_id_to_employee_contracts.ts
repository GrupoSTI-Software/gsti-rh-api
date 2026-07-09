import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_contracts` (salario y
 * condiciones contractuales, riesgo Crítico) es punto de entrada directo sin
 * marca de pertenencia propia.
 *
 * NOTA: la tabla ya tiene `payroll_business_unit_id` (unidad de negocio de
 * nómina del contrato — semántica de negocio distinta). `business_unit_id`
 * es la marca de aislamiento multi-tenant (pertenencia del empleado), igual
 * a la que ya tienen `employees`, `positions`, `departments`, etc.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_contracts'

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
         ADD INDEX \`employee_contracts_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_contracts_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_contracts_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_contracts_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
