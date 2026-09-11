import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import Employee from './employee.js'
import AccessPoint from './access_point.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Estados del envio del colaborador al equipo (spec ADMS 8.1). La rebanada 3
 * solo consume `revoke_acked`; el resto lo gobierna la matriz.
 */
export const ACCESS_POINT_EMPLOYEE_SYNC_STATUS = {
  PENDING_PIN: 'pending_pin',
  PENDING: 'pending',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  REVOKING: 'revoking',
  REVOKE_SENT: 'revoke_sent',
  REVOKE_ACKED: 'revoke_acked',
  REVOKE_FAILED: 'revoke_failed',
  REVOKED: 'revoked',
} as const

export type AccessPointEmployeeSyncStatus =
  (typeof ACCESS_POINT_EMPLOYEE_SYNC_STATUS)[keyof typeof ACCESS_POINT_EMPLOYEE_SYNC_STATUS]

/** Procedencia del PIN: `inferred` es el que dedujo el canal del codigo del colaborador. */
export const ACCESS_POINT_EMPLOYEE_PIN_SOURCE = {
  LEGACY: 'legacy',
  ASSIGNED: 'assigned',
  INFERRED: 'inferred',
  DEVICE: 'device',
} as const

export type AccessPointEmployeePinSource =
  (typeof ACCESS_POINT_EMPLOYEE_PIN_SOURCE)[keyof typeof ACCESS_POINT_EMPLOYEE_PIN_SOURCE]

/**
 * @swagger
 * components:
 *   schemas:
 *     AccessPointEmployee:
 *       type: object
 *       properties:
 *         accessPointEmployeeId:
 *           type: number
 *           description: Id de la relación entre el empleado y el punto de acceso
 *         employeeId:
 *           type: number
 *           description: Id del empleado
 *         accessPointId:
 *           type: number
 *           description: Id del punto de acceso
 *         accessPointEmployeePin:
 *           type: string
 *           description: Pin del empleado en el punto de acceso
 *         accessPointEmployeeCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de creación de la relación entre el empleado y el punto de acceso
 *         accessPointEmployeeUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de actualización de la relación entre el empleado y el punto de acceso
 *         accessPointEmployeeDeletedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de eliminación de la relación entre el empleado y el punto de acceso
 */
export default class AccessPointEmployee extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare accessPointEmployeeId: number

  @column()
  declare employeeId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058533).
   * Se ancla en el empleado, no en el punto de acceso.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: AccessPointEmployee) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare accessPointId: number

  @column()
  declare accessPointEmployeePin: string

  /**
   * Estado del envio del colaborador al equipo (spec ADMS 8.1). La maquina de
   * estados completa llega con la matriz; hoy solo se lee para detectar
   * `revoke_acked`, que pone la checada en cuarentena.
   */
  @column()
  declare accessPointEmployeeSyncStatus: AccessPointEmployeeSyncStatus

  @column.dateTime()
  declare accessPointEmployeeSyncRequestedAt: DateTime | null

  @column.dateTime()
  declare accessPointEmployeeSyncSentAt: DateTime | null

  @column.dateTime()
  declare accessPointEmployeeSyncConfirmedAt: DateTime | null

  @column.dateTime()
  declare accessPointEmployeeSyncFailedAt: DateTime | null

  @column()
  declare accessPointEmployeeSyncFailureReason: string | null

  /** De donde salio el PIN: `inferred` cuando se dedujo del codigo del colaborador. */
  @column()
  declare accessPointEmployeePinSource: AccessPointEmployeePinSource

  @column()
  declare lastDeviceCommandId: number | null

  @column.dateTime({ autoCreate: true })
  declare accessPointEmployeeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointEmployeeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'access_point_employee_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => AccessPoint, {
    foreignKey: 'accessPointId',
  })
  declare accessPoint: BelongsTo<typeof AccessPoint>
}
