import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1789328927648 — el contrato del empleado admite quedar sin departamento y
 * sin puesto, igual que `employees` (anulables desde 1741033244536 y 1741033268087).
 * MODIFY conserva las FK creadas en 1741016429096 y 1741016440017.
 * Una sentencia por columna (nota MySQL de 1784300000023). Sin DML y sin modelos.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_contracts'

  async up() {
    this.schema.raw('ALTER TABLE `employee_contracts` MODIFY COLUMN `department_id` INT UNSIGNED NULL')
    this.schema.raw('ALTER TABLE `employee_contracts` MODIFY COLUMN `position_id` INT UNSIGNED NULL')
  }

  async down() {
    this.defer(async (db) => {
      const rows = await db.rawQuery(
        'SELECT COUNT(*) AS total FROM `employee_contracts` WHERE `department_id` IS NULL OR `position_id` IS NULL'
      )
      const total = Number(rows?.[0]?.[0]?.total ?? 0)
      if (total > 0) {
        // Nunca se inventa un departamento o puesto para revertir.
        throw new Error(
          `[USRH1789328927648] down() abortado: ${total} contratos sin departamento o sin puesto`
        )
      }
      await db.rawQuery('ALTER TABLE `employee_contracts` MODIFY COLUMN `department_id` INT UNSIGNED NOT NULL')
      await db.rawQuery('ALTER TABLE `employee_contracts` MODIFY COLUMN `position_id` INT UNSIGNED NOT NULL')
    })
  }
}
