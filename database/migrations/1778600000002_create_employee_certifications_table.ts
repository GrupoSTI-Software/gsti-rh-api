import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_certifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_certification_id').notNullable()

      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')

      table
        .integer('certification_id')
        .unsigned()
        .notNullable()
        .references('certification_id')
        .inTable('certifications')
        .onDelete('RESTRICT')

      table.date('employee_certification_complied_at').notNullable()
      table.date('employee_certification_expires_at').nullable()
      table.string('employee_certification_document_url', 2048).nullable()

      table.timestamp('employee_certification_created_at').notNullable()
      table.timestamp('employee_certification_updated_at').nullable()
      table.timestamp('employee_certification_deleted_at').nullable()

      // Índice para acelerar el cruce (más reciente por empleado+certificación)
      table.index(
        ['employee_id', 'certification_id', 'employee_certification_complied_at'],
        'idx_ec_employee_cert_date'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
