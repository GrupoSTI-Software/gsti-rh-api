import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1790812613830 — rastro de la cancelación del expediente al deshacer
 * la baja (regla 4): cuándo se canceló y quién reactivó. Columnas propias y
 * no `closed_*` porque `reopen` las limpia y la tarjeta las lee como cierre.
 * Nullable: toda fila previa y todo expediente que nunca se cancela quedan en
 * NULL. FK `ON DELETE SET NULL`, espejo de `fk_emp_offb_closed_by`; nombre
 * corto explícito por el límite de 64 caracteres de MySQL. Sin índice nuevo:
 * los de estado ya cubren `cancelled`.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboardings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .datetime('employee_offboarding_cancelled_at')
        .nullable()
        .after('employee_offboarding_closed_at')
      table
        .integer('employee_offboarding_cancelled_by_user_id')
        .unsigned()
        .nullable()
        .after('employee_offboarding_cancelled_at')
      table
        .foreign('employee_offboarding_cancelled_by_user_id', 'fk_emp_offb_cancelled_by')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['employee_offboarding_cancelled_by_user_id'], 'fk_emp_offb_cancelled_by')
      table.dropColumn('employee_offboarding_cancelled_by_user_id')
      table.dropColumn('employee_offboarding_cancelled_at')
    })
  }
}
