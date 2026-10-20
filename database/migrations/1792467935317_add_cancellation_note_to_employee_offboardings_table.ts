import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1792172886315 — nota de motivo de la cancelación de RH (regla 3).
 * Columna propia: `employee_offboarding_notes` es la nota de programación y
 * la reescribe la edición de motivos (VLRH-H1792177926178). `text` nullable sin
 * default ni backfill: toda fila previa y toda cancelación por reactivación
 * (VLRH-H1790812613830) quedan en NULL; una nota no nula distingue la
 * cancelación de RH. Sin índice ni FK.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboardings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .text('employee_offboarding_cancellation_note')
        .nullable()
        .after('employee_offboarding_cancelled_by_user_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_offboarding_cancellation_note')
    })
  }
}
