import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected oldTableName = 'position_psychometric_profiles'
  protected newTableName = 'position_assessment_profiles'

  async up() {
    this.schema.alterTable(this.oldTableName, (table) => {
      table.dropForeign(['position_id'], 'pos_psych_profile_position_fk')
      table.dropForeign(['psychometric_test_dimension_id'], 'pos_psych_profile_dimension_fk')
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('position_psychometric_profile_id', 'position_assessment_profile_id')
      table.renameColumn(
        'psychometric_test_dimension_id',
        'assessment_template_dimension_id'
      )
      table.renameColumn(
        'position_psychometric_profile_minimum_value',
        'position_assessment_profile_minimum_value'
      )
      table.renameColumn(
        'position_psychometric_profile_maximum_value',
        'position_assessment_profile_maximum_value'
      )
      table.renameColumn(
        'position_psychometric_profile_created_at',
        'position_assessment_profile_created_at'
      )
      table.renameColumn(
        'position_psychometric_profile_updated_at',
        'position_assessment_profile_updated_at'
      )
      table.renameColumn(
        'position_psychometric_profile_deleted_at',
        'position_assessment_profile_deleted_at'
      )
    })

    this.schema.renameTable(this.oldTableName, this.newTableName)

    this.schema.alterTable(this.newTableName, (table) => {
      table
        .foreign('position_id', 'position_assessment_profile_position_fk')
        .references('position_id')
        .inTable('positions')
        .onDelete('CASCADE')
      table
        .foreign('assessment_template_dimension_id', 'position_assessment_profile_dimension_fk')
        .references('assessment_template_dimension_id')
        .inTable('assessment_template_dimensions')
        .onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable(this.newTableName, (table) => {
      table.dropForeign(['position_id'], 'position_assessment_profile_position_fk')
      table.dropForeign(
        ['assessment_template_dimension_id'],
        'position_assessment_profile_dimension_fk'
      )
    })

    this.schema.renameTable(this.newTableName, this.oldTableName)

    this.schema.alterTable(this.oldTableName, (table) => {
      table.renameColumn('position_assessment_profile_id', 'position_psychometric_profile_id')
      table.renameColumn(
        'assessment_template_dimension_id',
        'psychometric_test_dimension_id'
      )
      table.renameColumn(
        'position_assessment_profile_minimum_value',
        'position_psychometric_profile_minimum_value'
      )
      table.renameColumn(
        'position_assessment_profile_maximum_value',
        'position_psychometric_profile_maximum_value'
      )
      table.renameColumn(
        'position_assessment_profile_created_at',
        'position_psychometric_profile_created_at'
      )
      table.renameColumn(
        'position_assessment_profile_updated_at',
        'position_psychometric_profile_updated_at'
      )
      table.renameColumn(
        'position_assessment_profile_deleted_at',
        'position_psychometric_profile_deleted_at'
      )
    })

    this.schema.alterTable(this.oldTableName, (table) => {
      table
        .foreign('position_id', 'pos_psych_profile_position_fk')
        .references('position_id')
        .inTable('positions')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_dimension_id', 'pos_psych_profile_dimension_fk')
        .references('assessment_template_dimension_id')
        .inTable('assessment_template_dimensions')
        .onDelete('CASCADE')
    })
  }
}
