import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import type { LactationNotificationTypeValue } from '#constants/employee_lactation_notification'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeLactationPeriodNotification:
 *       type: object
 *       description: |
 *         Bitácora de notificaciones automáticas enviadas por el módulo de
 *         lactancia. Sirve como mecanismo de idempotencia del comando
 *         `lactation:notify-expiring`.
 *       properties:
 *         employeeLactationPeriodNotificationId:
 *           type: integer
 *           description: Identificador único del registro.
 *         employeeLactationPeriodId:
 *           type: integer
 *           description: Periodo de lactancia notificado (FK).
 *         businessUnitId:
 *           type: integer
 *           description: Unidad de negocio dueña (hereda del periodo, USRH1784259058510).
 *         lactationNotificationType:
 *           type: string
 *           enum: [expiring]
 *           description: Tipo de aviso (catálogo cerrado).
 *         lactationNotificationSentAt:
 *           type: string
 *           format: date-time
 *           description: Momento real del envío del correo.
 *         employeeLactationPeriodNotificationCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeLactationPeriodNotificationUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         employeeLactationPeriodNotificationDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmployeeLactationPeriodNotification extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_lactation_period_notifications'

  @column({ isPrimary: true })
  declare employeeLactationPeriodNotificationId: number

  @column()
  declare employeeLactationPeriodId: number

  /** Marca de pertenencia propia (hereda del periodo, USRH1784259058510). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el periodo padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeLactationPeriodNotification) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', instance.employeeLactationPeriodId)
          .first(),
      'el periodo de lactancia'
    )
  }

  @column()
  declare lactationNotificationType: LactationNotificationTypeValue

  @column.dateTime()
  declare lactationNotificationSentAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare employeeLactationPeriodNotificationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeLactationPeriodNotificationUpdatedAt: DateTime | null

  @column.dateTime({
    columnName: 'employee_lactation_period_notification_deleted_at',
  })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeLactationPeriod, {
    foreignKey: 'employeeLactationPeriodId',
  })
  declare employeeLactationPeriod: BelongsTo<typeof EmployeeLactationPeriod>
}
