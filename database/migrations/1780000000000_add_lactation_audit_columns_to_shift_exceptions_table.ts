import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega columnas de auditoría a `shift_exceptions` para soportar la HU de
 * gestión de conflictos de un periodo de lactancia (revocar/reasignar):
 *
 * - `shift_exceptions_lactation_replaced_date` (DATE, nullable): si la fila
 *   es resultado de una REASIGNACIÓN, conserva la fecha del día revocado
 *   original para que el reporte de cumplimiento pueda trazarla.
 * - `shift_exceptions_lactation_revoke_reason` (varchar(40), nullable): si
 *   la fila fue revocada (soft-delete) o reasignada, anota el motivo
 *   estable: 'vacation_conflict', 'work_disability_conflict',
 *   'maternity_conflict', 'rest_or_permission_conflict', 'holiday_conflict',
 *   'reassigned', 'manual_revoke'.
 *
 * Ambas columnas son nullable y sin default: los consumidores existentes de
 * `shift_exceptions` (assist, payroll, attendance, reports) no se ven
 * obligados a cambiar. Sin índices nuevos: las queries existentes por
 * `employee_id` + `shift_exceptions_date` siguen sirviendo.
 */
export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .date('shift_exceptions_lactation_replaced_date')
        .nullable()
        .after('lactation_period_id')
      table
        .string('shift_exceptions_lactation_revoke_reason', 40)
        .nullable()
        .after('shift_exceptions_lactation_replaced_date')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('shift_exceptions_lactation_revoke_reason')
      table.dropColumn('shift_exceptions_lactation_replaced_date')
    })
  }
}
