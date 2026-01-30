import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometrics'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_biometric_id').notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.foreign('employee_id').references('employee_id').inTable('employees').onDelete('CASCADE')
      table.text('employee_biometric_data', 'longtext').notNullable().comment('Formato: "Finger:1, Finger:2, Face"')
      
      table.timestamp('employee_biometric_created_at').notNullable()
      table.timestamp('employee_biometric_updated_at').nullable()
      table.timestamp('employee_biometric_deleted_at').nullable()
      
      table.unique(['employee_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
