import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1790812613829 — copia de los datos de la baja en el expediente de
 * salida. Reactivar limpia fecha, modalidad y tipo de baja del colaborador
 * (vuelve a contar para el cupo y para todo lo que filtra por esa fecha), y
 * el expediente los leía en vivo de `employees`: sin esta copia se perderían.
 * Se escriben una sola vez, al reactivar, sobre el expediente abierto; nulas
 * en los expedientes previos y en los que nunca pasaron por una reactivación.
 * Largos espejo de `employees` (modalidad 120, tipo 200); fecha `date` porque
 * solo importa el día. Sin índice, sin default, sin FK.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboardings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .date('employee_offboarding_termination_date')
        .nullable()
        .after('employee_offboarding_notes')
      table
        .string('employee_offboarding_termination_modality', 120)
        .nullable()
        .after('employee_offboarding_termination_date')
      table
        .string('employee_offboarding_termination_type', 200)
        .nullable()
        .after('employee_offboarding_termination_modality')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_offboarding_termination_type')
      table.dropColumn('employee_offboarding_termination_modality')
      table.dropColumn('employee_offboarding_termination_date')
    })
  }
}
