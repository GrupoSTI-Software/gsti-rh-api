import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table
        .integer('employee_type_id')
        .unsigned()
        .after('employee_last_synchronization_at')
        .nullable()
      table.foreign('employee_type_id').references('employee_types.employee_type_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign(['employee_type_id'])
      table.dropColumn('employee_type_id')
    })
  }
}
