import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (ESB-07-08-03-08) — `employee_address` es un punto
 * de entrada directo (`EmployeeAddressController.show/update/delete` cargan
 * por su propio PK sin validar el empleado padre) sin marca de pertenencia
 * propia. Mismo patrón que `1783200000000_add_business_unit_id_to_employee_proceeding_files.ts`.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_address'

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
         ADD INDEX \`employee_address_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_address_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_address_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_address_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
