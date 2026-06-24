import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'complaints'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_id')

      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table.foreign('employee_id').references('employee_id').inTable('employees')
      table.foreign('business_unit_id').references('business_unit_id').inTable('business_units')

      table.string('complaint_folio').notNullable().unique()
      table.string('complaint_passphrase_hash').notNullable()
      table.enum('complaint_category', ['violencia-laboral', 'entorno', 'otro']).notNullable()
      table.text('complaint_description').notNullable()
      table.enum('complaint_status', ['nuevo', 'en-revision', 'resuelto', 'cerrado']).notNullable().defaultTo('nuevo')

      table.timestamp('complaint_created_at').notNullable()
      table.timestamp('complaint_updated_at').notNullable()
      table.timestamp('complaint_deleted_at').nullable()
  })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}