import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeBiometricFaceId:
 *        type: object
 *        properties:
 *          employeeBiometricFaceIdId:
 *            type: number
 *            description: Employee Biometric Face ID identifier
 *          employeeId:
 *            type: number
 *            description: Employee ID
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (defensa en profundidad, USRH1783821206584)
 *          employeeBiometricFaceIdPhotoUrl:
 *            type: string
 *            description: URL of the biometric face photo stored in S3
 *          employeeBiometricFaceIdToken:
 *            type: string
 *            description: Token of the biometric face id
 *          employeeBiometricFaceIdCreatedAt:
 *            type: string
 *            format: date-time
 *          employeeBiometricFaceIdUpdatedAt:
 *            type: string
 *            format: date-time
 *          employeeBiometricFaceIdDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class EmployeeBiometricFaceId extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare employeeBiometricFaceIdId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1783821206584). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1783821206584). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeBiometricFaceId) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  /**
   * Key S3 de la foto facial de reconocimiento — cifrada AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato biométrico sensible reforzado).
   * El archivo en S3 ya es `private`; cifrar la key en BD protege también el puntero.
   * Columna ampliada a TEXT para alojar el ciphertext sin restricción de tamaño.
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
  declare employeeBiometricFaceIdPhotoUrl: string

  @column()
  declare employeeBiometricFaceIdToken: string

  @column.dateTime({ autoCreate: true })
  declare employeeBiometricFaceIdCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBiometricFaceIdUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_biometric_face_id_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @column()
  declare employeeBiometricFaceIdPhotoUrlProxy: string
}

