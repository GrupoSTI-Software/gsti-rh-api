import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migración USRH1782788926678 — Modalidad Híbrida y porcentaje de teletrabajo.
 *
 * Extiende el enum `employee_work_schedule` para aceptar `Hybrid` y agrega
 * los tres campos que sostienen la configuración y el porcentaje derivado:
 *   - `employee_work_schedule_hybrid_mode` (enum, nullable).
 *   - `employee_work_schedule_hybrid_config` (JSON, nullable).
 *   - `employee_telework_percentage` (DECIMAL(5,2), NOT NULL, default 0.00).
 *
 * También hace el backfill para respetar la compatibilidad (RN-14):
 *   - `Onsite`  → `employee_telework_percentage = 0.00`.
 *   - `Remote`  → `employee_telework_percentage = 100.00`.
 *
 * Ver `docs/spec-USRH1782788926678.md` §6 y §10.
 */
export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    // Toda la migración usa `this.db.rawQuery(...)` en vez de
    // `this.schema.alterTable(...)`. Motivo: Knex acumula los cambios del
    // schema builder y los ejecuta al final del método, mientras que los
    // `rawQuery` corren en el acto. Al intercalar ALTER y UPDATE, el schema
    // builder crea la columna después del backfill y este falla con
    // `Unknown column`. Con SQL crudo la ejecución es estrictamente secuencial.

    // Extender el enum para aceptar `Hybrid` (idempotente en MySQL).
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName}
       MODIFY employee_work_schedule ENUM('Onsite', 'Remote', 'Hybrid')
       NOT NULL DEFAULT 'Onsite'`
    )

    // Agregar las tres columnas nuevas antes del backfill.
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName}
       ADD COLUMN employee_work_schedule_hybrid_mode
         ENUM('SpecificDays', 'DaysPerWeek', 'DaysPerMonth') NULL,
       ADD COLUMN employee_work_schedule_hybrid_config JSON NULL,
       ADD COLUMN employee_telework_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00`
    )

    // Backfill compatibilidad — RN-14.
    await this.db.rawQuery(
      `UPDATE ${this.tableName}
       SET employee_telework_percentage = 0.00
       WHERE employee_work_schedule = 'Onsite'`
    )
    await this.db.rawQuery(
      `UPDATE ${this.tableName}
       SET employee_telework_percentage = 100.00
       WHERE employee_work_schedule = 'Remote'`
    )

    // Índice compuesto para el listado 5.1 (multi-tenant + umbral).
    await this.db.rawQuery(
      `CREATE INDEX idx_employees_telework_percentage
       ON ${this.tableName} (business_unit_id, employee_work_schedule, employee_telework_percentage)`
    )
  }

  async down() {
    // Solo se puede revertir el enum si no existen filas con `Hybrid`.
    // Se aborta con un error claro para que el operador limpie antes.
    const hybridRows = await this.db.rawQuery(
      `SELECT COUNT(*) AS total FROM ${this.tableName} WHERE employee_work_schedule = 'Hybrid'`
    )
    const total = Array.isArray(hybridRows)
      ? Number((hybridRows[0] as Array<{ total: number }>)[0]?.total ?? 0)
      : 0
    if (total > 0) {
      throw new Error(
        `No se puede revertir la migración: hay ${total} empleados con modalidad Hybrid. ` +
          'Migrelos a Onsite/Remote antes de ejecutar el rollback.'
      )
    }

    // Se replica el patrón de `up()`: SQL crudo secuencial para evitar el
    // problema de orden con el schema builder de Knex.
    await this.db.rawQuery(
      `DROP INDEX idx_employees_telework_percentage ON ${this.tableName}`
    )
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName}
       DROP COLUMN employee_telework_percentage,
       DROP COLUMN employee_work_schedule_hybrid_config,
       DROP COLUMN employee_work_schedule_hybrid_mode`
    )
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName}
       MODIFY employee_work_schedule ENUM('Onsite', 'Remote')
       NOT NULL DEFAULT 'Onsite'`
    )
  }
}
