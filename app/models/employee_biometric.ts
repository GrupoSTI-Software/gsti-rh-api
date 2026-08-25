import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeBiometric:
 *       type: object
 *       properties:
 *         employeeBiometricId:
 *           type: number
 *           description: Employee biometric id
 *         employeeId:
 *           type: number
 *           description: Employee id
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio dueña (defensa en profundidad, USRH1783821206584)
 *         employeeBiometricData:
 *           type: string
 *           description: Biometric data in format "Finger:1, Finger:2, Face". Puede llegar enmascarado según el permiso de lectura de su categoría.
 *         employeeBiometricCreatedAt:
 *           type: string
 *         employeeBiometricUpdatedAt:
 *           type: string
 *         employeeBiometricDeletedAt:
 *           type: string
 */
export default class EmployeeBiometric extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeBiometricId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1783821206584). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1783821206584). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeBiometric) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  /**
   * String de estado de enrolamiento biométrico (p.ej. "Finger:1, Face").
   * Cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI, dato biométrico sensible reforzado).
   * El template crudo vive en API_BIOMETRICS_HOST; este campo no se usa en WHERE de SQL.
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
    serialize: sensitiveSerialize('EmployeeBiometric', 'employeeBiometricData'),
  })
  declare employeeBiometricData: string

  @column()
  declare employeeBiometricStatus:
    | 'pending'
    | 'enrolling'
    | 'completed_fingers'
    | 'completed_face'
    | 'completed_both'
    | 'failed'

  @column.dateTime({ autoCreate: true })
  declare employeeBiometricCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBiometricUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_biometric_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}
