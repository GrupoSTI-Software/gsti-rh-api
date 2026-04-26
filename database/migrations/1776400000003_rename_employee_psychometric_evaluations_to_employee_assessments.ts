import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected oldTableName = 'employee_psychometric_evaluations'
  protected newTableName = 'employee_assessments'

  async up() {
    this.schema.alterTable(this.oldTableName, (table) => {
      table.dropForeign(['employee_id'], 'emp_psych_eval_employee_fk')
      table.dropForeign(['psychometric_test_id'], 'emp_psych_eval_test_fk')
      table.dropUnique(
        ['employee_id', 'psychometric_test_id', 'employee_psychometric_evaluation_date'],
        'emp_psych_eval_unique_employee_test_date'
      )
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table.dropForeign(
        ['employee_psychometric_evaluation_id'],
        'emp_psych_eval_result_eval_fk'
      )
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('employee_psychometric_evaluation_id', 'employee_assessment_id')
      table.renameColumn('psychometric_test_id', 'assessment_template_id')
      table.renameColumn('employee_psychometric_evaluation_date', 'employee_assessment_date')
      table.renameColumn('employee_psychometric_evaluation_status', 'employee_assessment_status')
      table.renameColumn(
        'employee_psychometric_evaluation_created_at',
        'employee_assessment_created_at'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_updated_at',
        'employee_assessment_updated_at'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_deleted_at',
        'employee_assessment_deleted_at'
      )
    })

    this.schema.renameTable(this.oldTableName, this.newTableName)

    this.schema.alterTable(this.newTableName, (table) => {
      table
        .foreign('employee_id', 'employee_assessment_employee_fk')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table
        .foreign('assessment_template_id', 'employee_assessment_template_fk')
        .references('assessment_template_id')
        .inTable('assessment_templates')
        .onDelete('CASCADE')
      table.unique(
        ['employee_id', 'assessment_template_id', 'employee_assessment_date'],
        'employee_assessment_unique_employee_template_date'
      )
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table
        .foreign('employee_psychometric_evaluation_id', 'emp_psych_eval_result_eval_fk')
        .references('employee_assessment_id')
        .inTable(this.newTableName)
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table.dropForeign(
        ['employee_psychometric_evaluation_id'],
        'emp_psych_eval_result_eval_fk'
      )
    })
    this.schema.alterTable(this.newTableName, (table) => {
      table.dropForeign(['employee_id'], 'employee_assessment_employee_fk')
      table.dropForeign(['assessment_template_id'], 'employee_assessment_template_fk')
      table.dropUnique(
        ['employee_id', 'assessment_template_id', 'employee_assessment_date'],
        'employee_assessment_unique_employee_template_date'
      )
    })

    this.schema.renameTable(this.newTableName, this.oldTableName)

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('employee_assessment_id', 'employee_psychometric_evaluation_id')
      table.renameColumn('assessment_template_id', 'psychometric_test_id')
      table.renameColumn('employee_assessment_date', 'employee_psychometric_evaluation_date')
      table.renameColumn('employee_assessment_status', 'employee_psychometric_evaluation_status')
      table.renameColumn(
        'employee_assessment_created_at',
        'employee_psychometric_evaluation_created_at'
      )
      table.renameColumn(
        'employee_assessment_updated_at',
        'employee_psychometric_evaluation_updated_at'
      )
      table.renameColumn(
        'employee_assessment_deleted_at',
        'employee_psychometric_evaluation_deleted_at'
      )
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table
        .foreign('employee_id', 'emp_psych_eval_employee_fk')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_id', 'emp_psych_eval_test_fk')
        .references('assessment_template_id')
        .inTable('assessment_templates')
        .onDelete('CASCADE')
      table.unique(
        ['employee_id', 'psychometric_test_id', 'employee_psychometric_evaluation_date'],
        'emp_psych_eval_unique_employee_test_date'
      )
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table
        .foreign('employee_psychometric_evaluation_id', 'emp_psych_eval_result_eval_fk')
        .references('employee_psychometric_evaluation_id')
        .inTable(this.oldTableName)
        .onDelete('CASCADE')
    })
  }
}
