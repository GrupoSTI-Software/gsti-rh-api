import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'traumatic_event_reports'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_report_id').notNullable()

      /**
       * FKs con nombre explícito: los auto-generados por Knex superan el
       * límite de 64 caracteres de MySQL (p. ej. captured_by_user_id).
       */
      table.integer('employee_id').unsigned().notNullable()
      table.integer('traumatic_event_type_id').unsigned().notNullable()

      table.date('traumatic_event_report_occurred_at').notNullable()
      table.dateTime('traumatic_event_report_elaborated_at').notNullable()
      table.text('traumatic_event_report_involved_people').notNullable()
      table.text('traumatic_event_report_description').notNullable()

      // 'employee' reservado para captura futura desde la app Flutter
      table
        .enum('traumatic_event_report_origin', ['employee', 'rh'])
        .notNullable()
        .defaultTo('rh')

      table.integer('traumatic_event_report_captured_by_user_id').unsigned().notNullable()

      table.timestamp('traumatic_event_report_created_at').notNullable()
      table.timestamp('traumatic_event_report_updated_at').nullable()
      table.timestamp('traumatic_event_report_deleted_at').nullable()

      table
        .foreign('employee_id', 'fk_ter_employee_id')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('traumatic_event_type_id', 'fk_ter_event_type_id')
        .references('traumatic_event_type_id')
        .inTable('traumatic_event_types')
        .onDelete('RESTRICT')

      table
        .foreign('traumatic_event_report_captured_by_user_id', 'fk_ter_captured_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['employee_id'], 'idx_ter_employee_id')
      table.index(['traumatic_event_type_id'], 'idx_ter_event_type_id')
      table.index(['traumatic_event_report_occurred_at'], 'idx_ter_occurred_at')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
