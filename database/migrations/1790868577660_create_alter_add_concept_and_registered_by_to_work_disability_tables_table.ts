import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Datos que pide la sección de incapacidades del empleado y no se guardaban:
 * quién registró cada periodo ("Registrado por …") y el concepto de cada gasto
 * interno ("Consulta médica de valoración").
 *
 * Ambas columnas son nullable: los periodos y gastos anteriores no tienen ese
 * dato y se muestran sin él.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('work_disability_periods', (table) => {
      table
        .integer('work_disability_period_registered_by_user_id')
        .unsigned()
        .nullable()
        .after('work_disability_type_id')
      table
        .foreign('work_disability_period_registered_by_user_id', 'fk_wdp_registered_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')
    })

    this.schema.alterTable('work_disability_period_expenses', (table) => {
      table
        .string('work_disability_period_expense_concept', 150)
        .nullable()
        .after('work_disability_period_expense_amount')
    })
  }

  async down() {
    this.schema.alterTable('work_disability_period_expenses', (table) => {
      table.dropColumn('work_disability_period_expense_concept')
    })

    this.schema.alterTable('work_disability_periods', (table) => {
      table.dropForeign(['work_disability_period_registered_by_user_id'], 'fk_wdp_registered_by_user_id')
      table.dropColumn('work_disability_period_registered_by_user_id')
    })
  }
}
