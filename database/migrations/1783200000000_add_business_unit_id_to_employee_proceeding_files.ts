import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Defensa en profundidad (USRH1783372659486) — `employee_proceeding_files` es
 * un punto de entrada directo (se consulta por su propio PK vía
 * `EmployeeProceedingFileService.show/update/delete` y por `employee_id` vía
 * `EmployeeService.getProceedingFiles`) que hoy no lleva marca de pertenencia
 * propia: el aislamiento depende enteramente de que el llamador valide primero
 * al empleado padre. Esta migración agrega `business_unit_id` para que el
 * modelo pueda componer `withBusinessUnitScope()` y filtrarse por sí mismo.
 *
 * Flujo:
 *  1. Agrega la columna como nullable (no bloquea filas existentes).
 *  2. Backfill en un solo UPDATE...JOIN desde `employees.business_unit_id`
 *     (cubre también expedientes con soft-delete, sin reabrir el universo).
 *  3. NOT NULL + índice, en un solo ALTER para minimizar locks.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_proceeding_files'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('employee_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` epf
         INNER JOIN \`employees\` e ON e.employee_id = epf.employee_id
         SET epf.business_unit_id = e.business_unit_id
         WHERE epf.business_unit_id IS NULL`
      )

      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL,
         ADD INDEX \`employee_proceeding_files_business_unit_id_index\` (\`business_unit_id\`),
         ADD CONSTRAINT \`employee_proceeding_files_business_unit_id_foreign\`
           FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`business_unit_id\`)`
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'employee_proceeding_files_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'employee_proceeding_files_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}
