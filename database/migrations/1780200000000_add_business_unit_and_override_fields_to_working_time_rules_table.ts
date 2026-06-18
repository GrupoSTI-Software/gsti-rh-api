import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'working_time_rules'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // El federal sigue siendo business_unit_id NULL; un valor indica override de esa empresa.
      table
        .integer('business_unit_id')
        .unsigned()
        .nullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('CASCADE')

      table.boolean('working_time_rule_exceeds_federal').notNullable().defaultTo(false)
      table.string('working_time_rule_override_justification', 500).nullable()

      table
        .integer('override_created_by_user_id')
        .unsigned()
        .nullable()
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      // Se elimina la unicidad federal (country_code, effective_year): bloquearía
      // coexistir un federal y los overrides del mismo año. La unicidad y el
      // no-traslape se validan a nivel de aplicación, por empresa.
      table.dropUnique(
        ['working_time_rule_country_code', 'working_time_rule_effective_year'],
        'working_time_rules_country_year_unique'
      )
    })
  }

  async down() {
    // ATENCIÓN: este down falla si ya existen overrides, porque al restaurar el
    // índice único (country_code, effective_year) reaparecerían duplicados
    // (federal + override del mismo país y año). Eliminar los overrides primero.
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'])
      table.dropForeign(['override_created_by_user_id'])
      table.dropColumn('business_unit_id')
      table.dropColumn('working_time_rule_exceeds_federal')
      table.dropColumn('working_time_rule_override_justification')
      table.dropColumn('override_created_by_user_id')

      table.unique(
        ['working_time_rule_country_code', 'working_time_rule_effective_year'],
        { indexName: 'working_time_rules_country_year_unique' }
      )
    })
  }
}
