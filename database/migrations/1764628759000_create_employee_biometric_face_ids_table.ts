import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometric_face_ids'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_biometric_face_id_id').primary()
      table.integer('employee_id').unsigned().notNullable()
      table.string('employee_biometric_face_id_photo_url').notNullable()
      table.timestamp('employee_biometric_face_id_created_at', { useTz: true }).notNullable()
      table.timestamp('employee_biometric_face_id_updated_at', { useTz: true }).notNullable()
      table.timestamp('employee_biometric_face_id_deleted_at', { useTz: true }).nullable()

      table.foreign('employee_id').references('employee_id').inTable('employees').onDelete('CASCADE')
      // Índice para mejorar las consultas por employee_id
      table.index(['employee_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

