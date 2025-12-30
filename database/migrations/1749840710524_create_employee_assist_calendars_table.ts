import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_assist_calendars'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName)
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('employee_assist_calendar_id').notNullable()

        table.integer('employee_id').unsigned().notNullable()
        table.foreign('employee_id').references('employees.employee_id')

        table.string('day', 50).notNullable()
        table.integer('check_in_assist_id').unsigned().nullable()
        table.string('check_in_date_time', 100).nullable()
        table.string('check_in_status', 50).nullable()
        table.integer('check_out_assist_id').unsigned().nullable()
        table.string('check_out_date_time', 100).nullable()
        table.string('check_out_status', 50).nullable()
        table.integer('check_eat_in_assist_id').unsigned().nullable()
        table.integer('check_eat_out_assist_id').unsigned().nullable()

        table.integer('shift_id').unsigned().nullable()
        table.foreign('shift_id').references('shifts.shift_id')

        table.boolean('shift_is_change').notNullable().defaultTo(0)
        table.boolean('has_exceptions').notNullable().defaultTo(0)

        table.integer('holiday_id').unsigned().nullable()
        table.foreign('holiday_id').references('holidays.holiday_id')

        table.boolean('is_birthday').notNullable().defaultTo(0)
        table.boolean('is_check_in_eat_next_day').notNullable().defaultTo(0)
        table.boolean('is_check_out_eat_next_day').notNullable().defaultTo(0)
        table.boolean('is_check_out_next_day').notNullable().defaultTo(0)
        table.boolean('is_future_day').notNullable().defaultTo(0)
        table.boolean('is_holiday').notNullable().defaultTo(0)
        table.boolean('is_rest_day').notNullable().defaultTo(0)
        table.boolean('is_sunday_bonus').notNullable().defaultTo(0)
        table.boolean('is_vacation_date').notNullable().defaultTo(0)
        table.boolean('is_work_disability_date').notNullable().defaultTo(0)

        table.string('shift_calculate_flag', 50).nullable()
        table.boolean('has_assit_flat_list').notNullable().defaultTo(0)

        table.timestamp('employee_assist_calendar_created_at').notNullable()
        table.timestamp('employee_assist_calendar_updated_at').nullable()
        table.timestamp('employee_assist_calendar_deleted_at').nullable()
      })
    }
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
