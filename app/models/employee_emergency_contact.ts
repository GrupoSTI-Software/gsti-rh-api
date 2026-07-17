/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
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

export default class EmployeeEmergencyContact extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
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

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeEmergencyContact) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

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
