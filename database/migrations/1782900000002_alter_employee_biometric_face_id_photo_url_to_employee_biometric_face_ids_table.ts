import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometric_face_ids'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('employee_biometric_face_id_photo_url').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_biometric_face_id_photo_url', 255).notNullable().alter()
    })
  }
}
