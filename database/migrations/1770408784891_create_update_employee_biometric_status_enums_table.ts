import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometrics'

  async up() {
    // Primero eliminar el enum existente y recrearlo con los nuevos valores
    this.schema.raw(`
      ALTER TABLE ${this.tableName} 
      MODIFY COLUMN employee_biometric_status ENUM(
        'pending', 
        'enrolling', 
        'completed_fingers', 
        'completed_face', 
        'completed_both', 
        'failed'
      ) DEFAULT 'pending'
    `)
  }

  async down() {
    // Revertir al enum original
    this.schema.raw(`
      ALTER TABLE ${this.tableName} 
      MODIFY COLUMN employee_biometric_status ENUM(
        'pending', 
        'enrolling', 
        'completed', 
        'failed'
      ) DEFAULT 'pending'
    `)
  }
}
