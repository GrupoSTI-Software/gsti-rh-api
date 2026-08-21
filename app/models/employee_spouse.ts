/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeSpouse:
 *        type: object
 *        properties:
 *          employeeSpouseId:
 *            type: number
 *            description: Employee spouse id
 *          employeeSpouseFirstname:
 *            type: string
 *            description: Employee spouse firstname
 *          employeeSpouseLastname:
 *            type: string
 *            description: Employee spouse lastname
 *          employeeSpouseSecondLastname:
 *            type: string
 *            description: Employee spouse second lastname
 *          employeeSpouseOcupation:
 *            type: string
 *            description: Employee spouse ocupation
 *          employeeSpouseBirthday:
 *            type: string
 *            description: Employee spouse birthday (YYYY-MM-DD)
 *          employeeSpousePhone:
 *            type: string
 *            description: Employee spouse phone
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeSpouseCreatedAt:
 *            type: string
 *          employeeSpouseUpdatedAt:
 *            type: string
 *          employeeSpouseDeletedAt:
 *            type: string
 *
 */

export default class EmployeeSpouse extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeSpouseId: number

  @column()
  declare employeeSpouseFirstname: string

  @column()
  declare employeeSpouseLastname: string

  @column()
  declare employeeSpouseSecondLastname: string

  @column()
  declare employeeSpouseOcupation: string

  @column()
  declare employeeSpouseBirthday: string

  /**
   * Teléfono del cónyuge — cifrado AES-256-CBC en reposo
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
    serialize: sensitiveSerialize('EmployeeSpouse', 'employeeSpousePhone'),
  })
  declare employeeSpousePhone: string

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeSpouse) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeSpouseCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeSpouseUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_spouse_deleted_at' })
  declare deletedAt: DateTime | null
}
