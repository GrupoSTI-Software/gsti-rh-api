import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_temporary_assignments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_temporary_assignment_id').notNullable()

      table.integer('employee_id').unsigned().notNullable()
      table
        .foreign('employee_id')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')

      table.integer('source_branch_id').unsigned().notNullable()
      table
        .foreign('source_branch_id')
        .references('branch_office_id')
        .inTable('branch_offices')
        .onDelete('RESTRICT')

      table.integer('target_branch_id').unsigned().notNullable()
      table
        .foreign('target_branch_id')
        .references('branch_office_id')
        .inTable('branch_offices')
        .onDelete('RESTRICT')

      table.date('start_date').notNullable()
      table.date('end_date').notNullable()
      table.integer('days').unsigned().notNullable()

      /** Turno ajustado — solo aplica el día 1 del préstamo */
      table.time('shift_override_start').nullable()
      table.time('shift_override_end').nullable()

      table.timestamp('employee_temporary_assignment_created_at').notNullable()
      table.timestamp('employee_temporary_assignment_updated_at').nullable()

      /** Índice compuesto para resolver préstamo vigente del empleado en fecha X */
      table.index(
        ['employee_id', 'start_date', 'end_date'],
        'eta_employee_date_range_idx'
      )

      /** Índice para uso futuro en reportes de la sucursal destino */
      table.index(
        ['target_branch_id', 'start_date', 'end_date'],
        'eta_target_branch_date_range_idx'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
