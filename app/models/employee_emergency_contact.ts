/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeEmergencyContact:
 *        type: object
 *        properties:
 *          employeeEmergencyContactId:
 *            type: number
 *            description: Employee emergency contact id
 *          employeeEmergencyContactFirstname:
 *            type: string
 *            description: Employee emergency contact firstname
 *          employeeEmergencyContactLastname:
 *            type: string
 *            description: Employee emergency contact lastname
 *          employeeEmergencyContactSecondLastname:
 *            type: string
 *            description: Employee emergency contact second lastname
 *          employeeEmergencyContactRelationship:
 *            type: string
 *            description: Employee emergency contact relationship
 *          employeeEmergencyContactPhone:
 *            type: string
 *            description: Employee emergency contact phone
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeEmergencyContactCreatedAt:
 *            type: string
 *          employeeEmergencyContactUpdatedAt:
 *            type: string
 *          employeeEmergencyContactDeletedAt:
 *            type: string
 *
 */

export default class EmployeeEmergencyContact extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeEmergencyContactId: number

  @column()
  declare employeeEmergencyContactFirstname: string

  @column()
  declare employeeEmergencyContactLastname: string

  @column()
  declare employeeEmergencyContactSecondLastname: string

  @column()
  declare employeeEmergencyContactRelationship: string

  /**
   * Teléfono del contacto de emergencia — cifrado AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato de contacto). No se usa en cláusulas WHERE de SQL.
   * Columna ampliada a VARCHAR(191) para alojar el ciphertext.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare employeeEmergencyContactPhone: string

  @column()
  declare employeeId: number

  /** Contacto principal: el que se muestra y edita en la plantilla de importación de empleados */
  @column()
  declare employeeEmergencyContactIsPrimary: boolean

  @column.dateTime({ autoCreate: true })
  declare employeeEmergencyContactCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeEmergencyContactUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_emergency_contact_deleted_at' })
  declare deletedAt: DateTime | null
}
