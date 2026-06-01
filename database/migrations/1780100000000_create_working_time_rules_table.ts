import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'working_time_rules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('working_time_rule_id').notNullable()
      table.string('working_time_rule_country_code', 2).notNullable().defaultTo('MX')
      table.smallint('working_time_rule_effective_year').notNullable()
      table.date('working_time_rule_valid_from').notNullable()
      table.date('working_time_rule_valid_to').nullable()
      table.decimal('working_time_rule_max_weekly_hours', 5, 2).notNullable()
      table.decimal('working_time_rule_max_weekly_overtime_hours', 5, 2).notNullable()
      table.decimal('working_time_rule_max_daily_overtime_hours', 4, 2).notNullable().defaultTo(4)
      table.tinyint('working_time_rule_max_overtime_days_per_week').unsigned().notNullable().defaultTo(4)
      table.decimal('working_time_rule_daily_hours_day', 4, 2).notNullable().defaultTo(8)
      table.decimal('working_time_rule_daily_hours_night', 4, 2).notNullable().defaultTo(7)
      table.decimal('working_time_rule_daily_hours_mixed', 4, 2).notNullable().defaultTo(7.5)
      table.tinyint('working_time_rule_work_days_per_rest_day').unsigned().notNullable().defaultTo(6)
      table.boolean('working_time_rule_salary_protection').notNullable().defaultTo(true)

      table.timestamp('working_time_rule_created_at').notNullable()
      table.timestamp('working_time_rule_updated_at').nullable()
      table.timestamp('working_time_rule_deleted_at').nullable()

      // Clave natural: una sola regla por país y año fiscal.
      table.unique(
        ['working_time_rule_country_code', 'working_time_rule_effective_year'],
        { indexName: 'working_time_rules_country_year_unique' }
      )

      // Índice de búsqueda por vigencia para resolver el tope vigente a una fecha.
      table.index(
        [
          'working_time_rule_country_code',
          'working_time_rule_valid_from',
          'working_time_rule_valid_to',
        ],
        'working_time_rules_country_validity_index'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
