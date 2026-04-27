import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected oldTableName = 'employee_psychometric_evaluation_results'
  protected newTableName = 'employee_assessment_results'

  async up() {
    this.schema.alterTable(this.oldTableName, (table) => {
      table.dropForeign(
        ['employee_psychometric_evaluation_id'],
        'emp_psych_eval_result_eval_fk'
      )
      table.dropForeign(['psychometric_test_dimension_id'], 'emp_psych_eval_result_dim_fk')
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn(
        'employee_psychometric_evaluation_result_id',
        'employee_assessment_result_id'
      )
      table.renameColumn('employee_psychometric_evaluation_id', 'employee_assessment_id')
      table.renameColumn(
        'psychometric_test_dimension_id',
        'assessment_template_dimension_id'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_result_value',
        'employee_assessment_result_value'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_result_status',
        'employee_assessment_result_status'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_result_created_at',
        'employee_assessment_result_created_at'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_result_updated_at',
        'employee_assessment_result_updated_at'
      )
      table.renameColumn(
        'employee_psychometric_evaluation_result_deleted_at',
        'employee_assessment_result_deleted_at'
      )
    })

    this.schema.renameTable(this.oldTableName, this.newTableName)

    this.schema.alterTable(this.newTableName, (table) => {
      table
        .foreign('employee_assessment_id', 'employee_assessment_result_assessment_fk')
        .references('employee_assessment_id')
        .inTable('employee_assessments')
        .onDelete('CASCADE')
      table
        .foreign(
          'assessment_template_dimension_id',
          'employee_assessment_result_dimension_fk'
        )
        .references('assessment_template_dimension_id')
        .inTable('assessment_template_dimensions')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.newTableName, (table) => {
      table.dropForeign(['employee_assessment_id'], 'employee_assessment_result_assessment_fk')
      table.dropForeign(
        ['assessment_template_dimension_id'],
        'employee_assessment_result_dimension_fk'
      )
    })

    this.schema.renameTable(this.newTableName, this.oldTableName)

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn(
        'employee_assessment_result_id',
        'employee_psychometric_evaluation_result_id'
      )
      table.renameColumn('employee_assessment_id', 'employee_psychometric_evaluation_id')
      table.renameColumn(
        'assessment_template_dimension_id',
        'psychometric_test_dimension_id'
      )
      table.renameColumn(
        'employee_assessment_result_value',
        'employee_psychometric_evaluation_result_value'
      )
      table.renameColumn(
        'employee_assessment_result_status',
        'employee_psychometric_evaluation_result_status'
      )
      table.renameColumn(
        'employee_assessment_result_created_at',
        'employee_psychometric_evaluation_result_created_at'
      )
      table.renameColumn(
        'employee_assessment_result_updated_at',
        'employee_psychometric_evaluation_result_updated_at'
      )
      table.renameColumn(
        'employee_assessment_result_deleted_at',
        'employee_psychometric_evaluation_result_deleted_at'
      )
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table
        .foreign('employee_psychometric_evaluation_id', 'emp_psych_eval_result_eval_fk')
        .references('employee_assessment_id')
        .inTable('employee_assessments')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_dimension_id', 'emp_psych_eval_result_dim_fk')
        .references('assessment_template_dimension_id')
        .inTable('assessment_template_dimensions')
        .onDelete('CASCADE')
    })
  }
}
