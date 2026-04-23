import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected oldTableName = 'psychometric_tests'
  protected newTableName = 'assessment_templates'

  async up() {
    this.schema.alterTable('psychometric_test_dimensions', (table) => {
      table.dropForeign(['psychometric_test_id'])
    })
    this.schema.alterTable('employee_psychometric_evaluations', (table) => {
      table.dropForeign(['psychometric_test_id'], 'emp_psych_eval_test_fk')
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('psychometric_test_id', 'assessment_template_id')
      table.renameColumn('psychometric_test_name', 'assessment_template_name')
      table.renameColumn('psychometric_test_description', 'assessment_template_description')
      table.renameColumn('psychometric_test_created_at', 'assessment_template_created_at')
      table.renameColumn('psychometric_test_updated_at', 'assessment_template_updated_at')
      table.renameColumn('psychometric_test_deleted_at', 'assessment_template_deleted_at')
    })

    this.schema.renameTable(this.oldTableName, this.newTableName)

    this.schema.alterTable('psychometric_test_dimensions', (table) => {
      table
        .foreign('psychometric_test_id', 'psychometric_test_dimensions_psychometric_test_id_foreign')
        .references('assessment_template_id')
        .inTable(this.newTableName)
        .onDelete('CASCADE')
    })
    this.schema.alterTable('employee_psychometric_evaluations', (table) => {
      table
        .foreign('psychometric_test_id', 'emp_psych_eval_test_fk')
        .references('assessment_template_id')
        .inTable(this.newTableName)
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable('psychometric_test_dimensions', (table) => {
      table.dropForeign(
        ['psychometric_test_id'],
        'psychometric_test_dimensions_psychometric_test_id_foreign'
      )
    })
    this.schema.alterTable('employee_psychometric_evaluations', (table) => {
      table.dropForeign(['psychometric_test_id'], 'emp_psych_eval_test_fk')
    })

    this.schema.renameTable(this.newTableName, this.oldTableName)

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('assessment_template_id', 'psychometric_test_id')
      table.renameColumn('assessment_template_name', 'psychometric_test_name')
      table.renameColumn('assessment_template_description', 'psychometric_test_description')
      table.renameColumn('assessment_template_created_at', 'psychometric_test_created_at')
      table.renameColumn('assessment_template_updated_at', 'psychometric_test_updated_at')
      table.renameColumn('assessment_template_deleted_at', 'psychometric_test_deleted_at')
    })

    this.schema.alterTable('psychometric_test_dimensions', (table) => {
      table
        .foreign('psychometric_test_id')
        .references('psychometric_test_id')
        .inTable(this.oldTableName)
        .onDelete('CASCADE')
    })
    this.schema.alterTable('employee_psychometric_evaluations', (table) => {
      table
        .foreign('psychometric_test_id', 'emp_psych_eval_test_fk')
        .references('psychometric_test_id')
        .inTable(this.oldTableName)
        .onDelete('CASCADE')
    })
  }
}
