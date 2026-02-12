import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometric_face_ids'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_biometric_face_id_token', 250).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_biometric_face_id_token')
    })
  }
}