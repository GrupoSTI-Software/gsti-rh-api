import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected oldTableName = 'psychometric_test_dimensions'
  protected newTableName = 'assessment_template_dimensions'

  async up() {
    this.schema.alterTable(this.oldTableName, (table) => {
      table.dropForeign(
        ['psychometric_test_id'],
        'psychometric_test_dimensions_psychometric_test_id_foreign'
      )
    })
    this.schema.alterTable('position_psychometric_profiles', (table) => {
      table.dropForeign(['psychometric_test_dimension_id'], 'pos_psych_profile_dimension_fk')
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table.dropForeign(['psychometric_test_dimension_id'], 'emp_psych_eval_result_dim_fk')
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('psychometric_test_dimension_id', 'assessment_template_dimension_id')
      table.renameColumn('psychometric_test_id', 'assessment_template_id')
      table.renameColumn('psychometric_test_dimension_name', 'assessment_template_dimension_name')
      table.renameColumn(
        'psychometric_test_dimension_acronym',
        'assessment_template_dimension_acronym'
      )
      table.renameColumn(
        'psychometric_test_dimension_created_at',
        'assessment_template_dimension_created_at'
      )
      table.renameColumn(
        'psychometric_test_dimension_updated_at',
        'assessment_template_dimension_updated_at'
      )
      table.renameColumn(
        'psychometric_test_dimension_deleted_at',
        'assessment_template_dimension_deleted_at'
      )
    })

    this.schema.renameTable(this.oldTableName, this.newTableName)

    this.schema.alterTable(this.newTableName, (table) => {
      table
        .foreign('assessment_template_id', 'assessment_template_dimension_template_fk')
        .references('assessment_template_id')
        .inTable('assessment_templates')
        .onDelete('CASCADE')
    })
    this.schema.alterTable('position_psychometric_profiles', (table) => {
      table
        .foreign('psychometric_test_dimension_id', 'pos_psych_profile_dimension_fk')
        .references('assessment_template_dimension_id')
        .inTable(this.newTableName)
        .onDelete('CASCADE')
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table
        .foreign('psychometric_test_dimension_id', 'emp_psych_eval_result_dim_fk')
        .references('assessment_template_dimension_id')
        .inTable(this.newTableName)
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.newTableName, (table) => {
      table.dropForeign(['assessment_template_id'], 'assessment_template_dimension_template_fk')
    })
    this.schema.alterTable('position_psychometric_profiles', (table) => {
      table.dropForeign(['psychometric_test_dimension_id'], 'pos_psych_profile_dimension_fk')
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table.dropForeign(['psychometric_test_dimension_id'], 'emp_psych_eval_result_dim_fk')
    })

    this.schema.renameTable(this.newTableName, this.oldTableName)

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('assessment_template_dimension_id', 'psychometric_test_dimension_id')
      table.renameColumn('assessment_template_id', 'psychometric_test_id')
      table.renameColumn('assessment_template_dimension_name', 'psychometric_test_dimension_name')
      table.renameColumn(
        'assessment_template_dimension_acronym',
        'psychometric_test_dimension_acronym'
      )
      table.renameColumn(
        'assessment_template_dimension_created_at',
        'psychometric_test_dimension_created_at'
      )
      table.renameColumn(
        'assessment_template_dimension_updated_at',
        'psychometric_test_dimension_updated_at'
      )
      table.renameColumn(
        'assessment_template_dimension_deleted_at',
        'psychometric_test_dimension_deleted_at'
      )
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table
        .foreign('psychometric_test_id', 'psychometric_test_dimensions_psychometric_test_id_foreign')
        .references('assessment_template_id')
        .inTable('assessment_templates')
        .onDelete('CASCADE')
    })
    this.schema.alterTable('position_psychometric_profiles', (table) => {
      table
        .foreign('psychometric_test_dimension_id', 'pos_psych_profile_dimension_fk')
        .references('psychometric_test_dimension_id')
        .inTable(this.oldTableName)
        .onDelete('CASCADE')
    })
    this.schema.alterTable('employee_psychometric_evaluation_results', (table) => {
      table
        .foreign('psychometric_test_dimension_id', 'emp_psych_eval_result_dim_fk')
        .references('psychometric_test_dimension_id')
        .inTable(this.oldTableName)
        .onDelete('CASCADE')
    })
  }
}
