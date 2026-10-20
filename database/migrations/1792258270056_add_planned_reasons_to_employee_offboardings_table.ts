import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1792172854107 — motivos de la baja programada en el expediente de
 * salida. La fecha de baja es `employee_offboarding_planned_date`; modalidad y
 * tipo se capturan al programar. Las columnas `termination_*` no cambian: son la
 * copia que escribe la reactivación y, desde VLRH-H1792172881508, el cierre.
 * Nulas en los expedientes previos y en los abiertos por la baja directa
 * ("motivos por capturar", sin backfill). Largos espejo de `employees`
 * (modalidad 120, tipo 200). Sin índice, sin default, sin FK.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_offboardings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('employee_offboarding_planned_modality', 120)
        .nullable()
        .after('employee_offboarding_planned_date')
      table
        .string('employee_offboarding_planned_type', 200)
        .nullable()
        .after('employee_offboarding_planned_modality')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_offboarding_planned_type')
      table.dropColumn('employee_offboarding_planned_modality')
    })
  }
}
