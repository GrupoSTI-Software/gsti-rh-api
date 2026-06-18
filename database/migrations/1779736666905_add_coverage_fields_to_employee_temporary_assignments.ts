import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_temporary_assignments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('reason', 80).nullable().after('days')
      table
        .integer('destination_shift_id')
        .unsigned()
        .nullable()
        .after('reason')
        .references('shift_id')
        .inTable('shifts')
        .onDelete('RESTRICT')
      table.date('cancelled_at').nullable().after('destination_shift_id')
      table.timestamp('employee_temporary_assignment_deleted_at').nullable().after('cancelled_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_temporary_assignment_deleted_at')
      table.dropColumn('cancelled_at')
      table.dropForeign(['destination_shift_id'])
      table.dropColumn('destination_shift_id')
      table.dropColumn('reason')
    })
  }
}
